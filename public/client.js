const socket = io();

const form = document.getElementById('chat-form');
const usernameInput = document.getElementById('username');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages');

// Función reutilizable para dibujar cualquier mensaje en pantalla
function agregarMensajeEnPantalla(data) {
  const item = document.createElement('li');
  const autor = document.createElement('strong');
  autor.textContent = data.user;

  item.appendChild(autor);
  item.appendChild(document.createTextNode(' ' + data.text));

  messagesList.appendChild(item);
  messagesList.scrollTop = messagesList.scrollHeight;
}

// 1. Enviar mensaje al servidor
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (messageInput.value && usernameInput.value) {
    socket.emit('chat message', {
      user: usernameInput.value,
      text: messageInput.value
    });
    messageInput.value = '';
  }
});

// 2. Recibir mensaje nuevo en tiempo real
socket.on('chat message', (data) => {
  agregarMensajeEnPantalla(data);
});

// 3. Recibir y mostrar el historial guardado en MongoDB al abrir la página
socket.on('cargar historial', (mensajes) => {
  messagesList.innerHTML = '';
  mensajes.forEach((msg) => {
    agregarMensajeEnPantalla(msg);
  });
});