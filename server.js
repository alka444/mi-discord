require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const JWT_SECRET = process.env.JWT_SECRET || 'clave_respaldo_cambiar_en_env';

// Permitir que Express entienda datos en formato JSON
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Conectar a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch((err) => console.error('Error conectando a MongoDB:', err));

// 2. Modelos de la base de datos (Usuarios y Mensajes)
const usuarioSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true }
});

const mensajeSchema = new mongoose.Schema({
  user: String,
  text: String,
  fecha: { type: Date, default: Date.now }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);
const Mensaje = mongoose.model('Mensaje', mensajeSchema);

// 3. Ruta para CREAR CUENTA (Registro)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || username.trim().length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 letras y la contraseña 4 caracteres.' });
    }

    // Encriptar contraseña antes de guardarla
    const passwordEncriptada = await bcrypt.hash(password, 10);

    const nuevoUsuario = new Usuario({
      username: username.trim(),
      password: passwordEncriptada
    });

    await nuevoUsuario.save();

    // Crear pase de sesión (válido por 7 días)
    const token = jwt.sign({ username: nuevoUsuario.username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, username: nuevoUsuario.username });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya está ocupado.' });
    }
    res.status(500).json({ error: 'Error al crear la cuenta.' });
  }
});

// 4. Ruta para INICIAR SESIÓN (Login)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const usuario = await Usuario.findOne({ username: username.trim() });
    if (!usuario) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    // Comparar contraseña escrita con la encriptada en MongoDB
    const esValida = await bcrypt.compare(password, usuario.password);
    if (!esValida) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = jwt.sign({ username: usuario.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, username: usuario.username });
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// 5. Middleware de Socket.io: solo deja conectar a usuarios con token válido
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('No autorizado'));
  }

  try {
    const datos = jwt.verify(token, JWT_SECRET);
    socket.username = datos.username; // Guardamos el nombre real en la conexión
    next();
  } catch (err) {
    next(new Error('Sesión expirada o inválida'));
  }
});

// 6. Eventos del chat en tiempo real
io.on('connection', async (socket) => {
  console.log('Usuario autenticado conectado:', socket.username);

  try {
    const historial = await Mensaje.find().sort({ fecha: 1 }).limit(50);
    socket.emit('cargar historial', historial);
  } catch (error) {
    console.error('Error al cargar historial:', error);
  }

  socket.on('chat message', async (data) => {
    try {
      // Usamos socket.username del servidor para que nadie pueda falsificar su nombre
      const nuevoMensaje = new Mensaje({
        user: socket.username,
        text: data.text
      });
      await nuevoMensaje.save();

      io.emit('chat message', {
        user: socket.username,
        text: data.text
      });
    } catch (error) {
      console.error('Error al guardar mensaje:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.username);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});