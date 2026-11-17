require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Conectar a MongoDB Atlas usando la variable MONGO_URI
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch((err) => console.error('Error conectando a MongoDB:', err));

// 2. Definir cómo se guarda cada mensaje en la base de datos
const mensajeSchema = new mongoose.Schema({
  user: String,
  text: String,
  fecha: { type: Date, default: Date.now }
});

const Mensaje = mongoose.model('Mensaje', mensajeSchema);

app.use(express.static(path.join(__dirname, 'public')));

// 3. Eventos en tiempo real
io.on('connection', async (socket) => {
  console.log('Un usuario se ha conectado:', socket.id);

  // Cargar los últimos 50 mensajes guardados cuando alguien entra
  try {
    const historial = await Mensaje.find().sort({ fecha: 1 }).limit(50);
    socket.emit('cargar historial', historial);
  } catch (error) {
    console.error('Error al cargar historial:', error);
  }

  // Guardar mensaje nuevo en MongoDB y enviarlo a todos
  socket.on('chat message', async (data) => {
    try {
      const nuevoMensaje = new Mensaje({
        user: data.user,
        text: data.text
      });
      await nuevoMensaje.save();

      io.emit('chat message', data);
    } catch (error) {
      console.error('Error al guardar mensaje:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado');
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});