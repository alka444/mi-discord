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

app.use(express.json({ limit: '500kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. Conectar a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch((err) => console.error('Error conectando a MongoDB:', err));

// 2. Modelos de la base de datos
const usuarioSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '¡Hola! Soy nuevo en Mini Discord.', maxlength: 160 }
});

const mensajeSchema = new mongoose.Schema({
  user: String,
  text: String,
  fecha: { type: Date, default: Date.now }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);
const Mensaje = mongoose.model('Mensaje', mensajeSchema);

// Middleware para verificar el token en rutas HTTP
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    const datos = jwt.verify(token, JWT_SECRET);
    req.username = datos.username;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// 3. Ruta para CREAR CUENTA
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || username.trim().length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 letras y la contraseña 4 caracteres.' });
    }

    const passwordEncriptada = await bcrypt.hash(password, 10);

    const nuevoUsuario = new Usuario({
      username: username.trim(),
      password: passwordEncriptada
    });

    await nuevoUsuario.save();

    const token = jwt.sign({ username: nuevoUsuario.username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      username: nuevoUsuario.username,
      avatar: nuevoUsuario.avatar,
      bio: nuevoUsuario.bio
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya está ocupado.' });
    }
    res.status(500).json({ error: 'Error al crear la cuenta.' });
  }
});

// 4. Ruta para INICIAR SESIÓN
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const usuario = await Usuario.findOne({ username: username.trim() });
    if (!usuario) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const esValida = await bcrypt.compare(password, usuario.password);
    if (!esValida) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = jwt.sign({ username: usuario.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      username: usuario.username,
      avatar: usuario.avatar || '',
      bio: usuario.bio || ''
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// 5. Ruta para ACTUALIZAR PERFIL (foto y bio)
app.put('/api/profile', verificarToken, async (req, res) => {
  try {
    const { avatar, bio } = req.body;

    // Validar que el avatar sea vacío o una imagen base64 válida y ligera
    if (avatar !== undefined && avatar !== '') {
      const esImagenValida = typeof avatar === 'string' &&
        (avatar.startsWith('data:image/jpeg;base64,') || avatar.startsWith('data:image/png;base64,')) &&
        avatar.length < 150000;

      if (!esImagenValida) {
        return res.status(400).json({ error: 'Formato de imagen no válido o demasiado pesado.' });
      }
    }

    const bioLimpia = typeof bio === 'string' ? bio.trim().slice(0, 160) : '';

    const actualizaciones = { bio: bioLimpia };
    if (avatar !== undefined) {
      actualizaciones.avatar = avatar;
    }

    const usuarioActualizado = await Usuario.findOneAndUpdate(
      { username: req.username },
      actualizaciones,
      { new: true }
    );

    // Avisar a todos los conectados si cambió su avatar para actualizar el chat en vivo
    io.emit('perfil actualizado', {
      username: usuarioActualizado.username,
      avatar: usuarioActualizado.avatar
    });

    res.json({
      username: usuarioActualizado.username,
      avatar: usuarioActualizado.avatar,
      bio: usuarioActualizado.bio
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el perfil.' });
  }
});

// 6. Ruta para VER EL PERFIL DE CUALQUIER USUARIO
app.get('/api/users/:username', verificarToken, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ username: req.params.username }, 'username avatar bio');
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({
      username: usuario.username,
      avatar: usuario.avatar || '',
      bio: usuario.bio || 'Sin biografía.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener perfil.' });
  }
});

// 7. Middleware de Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No autorizado'));

  try {
    const datos = jwt.verify(token, JWT_SECRET);
    socket.username = datos.username;
    next();
  } catch (err) {
    next(new Error('Sesión expirada o inválida'));
  }
});

// 8. Eventos del chat en tiempo real
io.on('connection', async (socket) => {
  console.log('Usuario autenticado conectado:', socket.username);

  try {
    const historial = await Mensaje.find().sort({ fecha: 1 }).limit(50).lean();
    const usuarios = await Usuario.find({}, 'username avatar').lean();

    // Crear un mapa rápido de { nombreUsuario: avatar }
    const mapaAvatares = {};
    usuarios.forEach((u) => {
      mapaAvatares[u.username] = u.avatar || '';
    });

    const historialConAvatares = historial.map((msg) => ({
      ...msg,
      avatar: mapaAvatares[msg.user] || ''
    }));

    socket.emit('cargar historial', historialConAvatares);
  } catch (error) {
    console.error('Error al cargar historial:', error);
  }

  socket.on('chat message', async (data) => {
    try {
      const nuevoMensaje = new Mensaje({
        user: socket.username,
        text: data.text
      });
      await nuevoMensaje.save();

      const usuarioActual = await Usuario.findOne({ username: socket.username }, 'avatar').lean();

      io.emit('chat message', {
        user: socket.username,
        avatar: usuarioActual ? usuarioActual.avatar : '',
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