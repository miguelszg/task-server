const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;


app.options('*', cors());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
// Middleware para parsear JSON
app.use(express.json());

// Optimización de conexión MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('🟢 Conectado a MongoDB Atlas'))
.catch(err => console.error('🔴 Error al conectar a MongoDB:', err));

// Esquemas y modelos
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: Number, default: 2 }, // 1 = Admin, 2 = Usuario normal
});
const User = mongoose.model('User', userSchema);

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, 
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
});
const Group = mongoose.model('Group', groupSchema);

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  dueDate: { type: Date, required: true },
  category: { type: String, required: true },
  status: { type: String, required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastUpdated: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// Middleware para registrar peticiones
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Rutas de usuario
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUserByUsername = await User.findOne({ username });
    if (existingUserByUsername) {
      return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso' });
    }

    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return res.status(400).json({ success: false, message: 'El correo electrónico ya está en uso' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ 
      username, 
      email, 
      password: hashedPassword,
      role: 2 
    });
    await newUser.save();

    res.json({ success: true, message: 'Usuario registrado exitosamente' });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ success: false, message: 'Error al registrar usuario' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Contraseña incorrecta' });
    }

    res.json({ success: true, message: 'Inicio de sesión exitoso', user });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ success: false, message: 'Error al iniciar sesión' });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).lean();
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ success: false, message: 'Error al obtener usuarios' });
  }
});

app.put('/users/:userId/role', async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  
  try {
    if (role !== 1 && role !== 2) {
      return res.status(400).json({ success: false, message: 'Rol inválido. Solo se permiten roles 1 (Admin) o 2 (Usuario)' });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      userId, 
      { role }, 
      { new: true, select: '-password' }
    );
    
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    res.json({ success: true, message: 'Rol de usuario actualizado exitosamente', user: updatedUser });
  } catch (error) {
    console.error('Error al actualizar el rol del usuario:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar el rol del usuario' });
  }
});

// Rutas de grupos
app.post('/groups', async (req, res) => {
  const { name, createdBy, members } = req.body;

  try {
    const existingGroup = await Group.findOne({ name });
    if (existingGroup) {
      return res.status(400).json({ success: false, message: 'El nombre del grupo ya está en uso' });
    }

    const newGroup = new Group({ name, createdBy, members });
    await newGroup.save();

    res.json({ success: true, message: 'Grupo creado exitosamente', group: newGroup });
  } catch (error) {
    console.error('Error al crear el grupo:', error);
    res.status(500).json({ success: false, message: 'Error al crear el grupo' });
  }
});

app.get('/groups', async (req, res) => {
  try {
    const groups = await Group.find({})
      .populate('createdBy members', 'username')
      .lean();
    
    res.json({ success: true, groups });
  } catch (error) {
    console.error('Error al obtener grupos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener grupos' });
  }
});

app.get('/groups/:groupId/tasks', async (req, res) => {
  const { groupId } = req.params;

  try {
    const tasks = await Task.find({ group: groupId })
      .populate('group', 'name')
      .populate('assignedTo', 'username')
      .populate('createdBy', 'username')
      .lean();

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error al obtener las tareas del grupo:', error);
    res.status(500).json({ success: false, message: 'Error al obtener las tareas del grupo' });
  }
});

app.get('/admin/tasks', async (req, res) => {
  try {
    const tasks = await Task.find({})
      .populate('group', 'name')
      .populate('assignedTo', 'username')
      .populate('createdBy', 'username')
      .lean();

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error al obtener todas las tareas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener todas las tareas' });
  }
});

app.get('/groups/:groupId', async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await Group.findById(groupId)
      .populate('createdBy', 'username')
      .populate('members', 'username')
      .lean();

    if (!group) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
    }

    res.json({ success: true, group });
  } catch (error) {
    console.error('Error al obtener el grupo:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el grupo' });
  }
});

// Rutas de tareas
app.post('/tasks', async (req, res) => {
  const { name, description, dueDate, category, status, group, assignedTo, createdBy } = req.body;

  try {
    const newTask = new Task({
      name,
      description,
      dueDate,
      category,
      status,
      group,
      assignedTo,
      createdBy,
      lastUpdated: new Date()
    });

    await newTask.save();
    res.json({ success: true, message: 'Tarea creada exitosamente', task: newTask });
  } catch (error) {
    console.error('Error al crear la tarea:', error);
    res.status(500).json({ success: false, message: 'Error al crear la tarea' });
  }
});

app.get('/users/:userId/tasks', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    let tasks;
    
    if (user.role === 1) {
      tasks = await Task.find({})
        .populate('group', 'name')
        .populate('assignedTo', 'username')
        .populate('createdBy', 'username')
        .lean();
    } else {
      const groups = await Group.find({ members: userId });
      const groupIds = groups.map((group) => group._id);
      
      tasks = await Task.find({ group: { $in: groupIds } })
        .populate('group', 'name')
        .populate('assignedTo', 'username')
        .populate('createdBy', 'username')
        .lean();
    }

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error al obtener las tareas del usuario:', error);
    res.status(500).json({ success: false, message: 'Error al obtener las tareas del usuario' });
  }
});

app.get('/users/:userId/groups', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    let groups;
    
    if (user.role === 1) {
      groups = await Group.find({}).lean();
    } else {
      groups = await Group.find({ members: userId }).lean();
    }
    
    res.json({ success: true, groups });
  } catch (error) {
    console.error('Error al obtener los grupos del usuario:', error);
    res.status(500).json({ success: false, message: 'Error al obtener los grupos del usuario' });
  }
});

app.put('/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const taskData = req.body;

  try {
    taskData.lastUpdated = new Date();
    
    const updatedTask = await Task.findByIdAndUpdate(taskId, taskData, { new: true });
    res.json({ success: true, message: 'Tarea actualizada', task: updatedTask });
  } catch (error) {
    console.error('Error al actualizar la tarea:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar la tarea' });
  }
});

app.delete('/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;

  try {
    await Task.findByIdAndDelete(taskId);
    res.json({ success: true, message: 'Tarea eliminada' });
  } catch (error) {
    console.error('Error al eliminar la tarea:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar la tarea' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Sesión cerrada exitosamente' });
});

app.get('/prueba', (req, res) => {
  res.json({ success: true, message: 'Prueba exitosa' });
  console.log('Prueba exitosa');
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Al final de tu archivo, antes de app.listen
app.use((err, req, res, next) => {
  console.error('Error en el servidor:', err);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});