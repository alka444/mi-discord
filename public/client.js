const socket = io();

const form = document.getElementById('chat-form');
const usernameInput = document.getElementById('username');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages');

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

// 2. Recibir mensaje del servidor y mostrarlo en pantalla
socket.on('chat message', (data) => {
  const item = document.createElement('li');
  item.innerHTML = `<strong>${data.user}</strong> ${data.text}`;
  messagesList.appendChild(item);
  
  // Hacer scroll automático hacia abajo
  messagesList.scrollTop = messagesList.scrollHeight;
});