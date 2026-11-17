let socket = null;
let modoRegistro = false;

// Elementos de autenticación
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authSwitchLink = document.getElementById('auth-switch-link');

// Elementos del chat
const currentUserSpan = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');
const form = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages');

// Alternar entre Iniciar Sesión y Registrarse
authSwitchLink.addEventListener('click', (e) => {
  e.preventDefault();
  modoRegistro = !modoRegistro;
  authError.textContent = '';

  if (modoRegistro) {
    authTitle.textContent = 'Crear una cuenta';
    authSubtitle.textContent = 'Elige un nombre de usuario y contraseña';
    authSubmitBtn.textContent = 'Registrarse';
    authSwitchText.textContent = '¿Ya tienes una cuenta?';
    authSwitchLink.textContent = 'Iniciar sesión';
  } else {
    authTitle.textContent = '¡Te damos la bienvenida de nuevo!';
    authSubtitle.textContent = 'Inicia sesión para entrar al chat';
    authSubmitBtn.textContent = 'Iniciar sesión';
    authSwitchText.textContent = '¿Necesitas una cuenta?';
    authSwitchLink.textContent = 'Registrarse';
  }
});

// Enviar formulario de Login o Registro
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';

  const ruta = modoRegistro ? '/api/register' : '/api/login';

  try {
    const respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: authUsername.value,
        password: authPassword.value
      })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      authError.textContent = datos.error || 'Ocurrió un error';
      return;
    }

    // Guardar sesión en el navegador y entrar al chat
    localStorage.setItem('token', datos.token);
    localStorage.setItem('username', datos.username);
    iniciarChat(datos.token, datos.username);
  } catch (err) {
    authError.textContent = 'No se pudo conectar con el servidor.';
  }
});

function agregarMensajeEnPantalla(data) {
  const item = document.createElement('li');
  const autor = document.createElement('strong');
  autor.textContent = data.user;

  item.appendChild(autor);
  item.appendChild(document.createTextNode(' ' + data.text));

  messagesList.appendChild(item);
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Conectar Socket.io y mostrar la interfaz del chat
function iniciarChat(token, username) {
  authContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');
  currentUserSpan.textContent = username;

  socket = io({
    auth: { token }
  });

  socket.on('cargar historial', (mensajes) => {
    messagesList.innerHTML = '';
    mensajes.forEach((msg) => {
      agregarMensajeEnPantalla(msg);
    });
  });

  socket.on('chat message', (data) => {
    agregarMensajeEnPantalla(data);
  });

  // Si el token es inválido o expiró, cerrar sesión automáticamente
  socket.on('connect_error', () => {
    cerrarSesion();
  });
}

// Enviar mensaje al servidor
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (messageInput.value && socket) {
    socket.emit('chat message', {
      text: messageInput.value
    });
    messageInput.value = '';
  }
});

// Cerrar sesión
function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  messagesList.innerHTML = '';
  authUsername.value = '';
  authPassword.value = '';
  appContainer.classList.add('hidden');
  authContainer.classList.remove('hidden');
}

logoutBtn.addEventListener('click', cerrarSesion);

// Al cargar la página, comprobar si ya había una sesión guardada
const tokenGuardado = localStorage.getItem('token');
const usuarioGuardado = localStorage.getItem('username');

if (tokenGuardado && usuarioGuardado) {
  iniciarChat(tokenGuardado, usuarioGuardado);
}