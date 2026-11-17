let socket = null;
let modoRegistro = false;
let nuevoAvatarBase64 = undefined;

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

// Elementos del chat y panel inferior
const currentUserSpan = document.getElementById('current-user');
const currentUserAvatar = document.getElementById('current-user-avatar');
const logoutBtn = document.getElementById('logout-btn');
const form = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages');

// Elementos del modal de Editar Perfil
const openEditProfileBtn = document.getElementById('open-edit-profile');
const editProfileModal = document.getElementById('edit-profile-modal');
const editProfileForm = document.getElementById('edit-profile-form');
const editAvatarPreview = document.getElementById('edit-avatar-preview');
const avatarFileInput = document.getElementById('avatar-file-input');
const editBioInput = document.getElementById('edit-bio-input');
const editProfileError = document.getElementById('edit-profile-error');
const cancelEditProfileBtn = document.getElementById('cancel-edit-profile');

// Elementos del modal de Ver Perfil
const viewProfileModal = document.getElementById('view-profile-modal');
const viewProfileAvatar = document.getElementById('view-profile-avatar');
const viewProfileUsername = document.getElementById('view-profile-username');
const viewProfileBio = document.getElementById('view-profile-bio');
const closeViewProfileBtn = document.getElementById('close-view-profile');

// Generar un avatar con inicial y color único si el usuario no tiene foto
function obtenerUrlAvatar(avatar, username) {
  if (avatar && avatar.startsWith('data:image/')) {
    return avatar;
  }
  const rawInicial = (username || '?').trim().charAt(0).toUpperCase();
  const inicial = /[A-Z0-9ÑÁÉÍÓÚ]/.test(rawInicial) ? rawInicial : '?';
  const colores = ['#5865f2', '#23a55a', '#f0b232', '#da373c', '#eb459e', '#00a8fc'];
  let hash = 0;
  for (let i = 0; i < (username || '').length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colores[Math.abs(hash) % colores.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="60" font-weight="bold">${inicial}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Recortar y comprimir la foto seleccionada a 128x128 px
function procesarImagen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

    localStorage.setItem('token', datos.token);
    localStorage.setItem('username', datos.username);
    localStorage.setItem('avatar', datos.avatar || '');
    localStorage.setItem('bio', datos.bio || '');
    iniciarChat(datos.token, datos.username);
  } catch (err) {
    authError.textContent = 'No se pudo conectar con el servidor.';
  }
});

// Abrir modal para ver perfil de otro usuario
async function abrirPerfilDeUsuario(username) {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const respuesta = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!respuesta.ok) return;

    const perfil = await respuesta.json();
    viewProfileUsername.textContent = perfil.username;
    viewProfileAvatar.src = obtenerUrlAvatar(perfil.avatar, perfil.username);
    viewProfileBio.textContent = perfil.bio || 'Sin biografía.';
    viewProfileModal.classList.remove('hidden');
  } catch (err) {
    console.error('Error al cargar perfil:', err);
  }
}

closeViewProfileBtn.addEventListener('click', () => {
  viewProfileModal.classList.add('hidden');
});

viewProfileModal.addEventListener('click', (e) => {
  if (e.target === viewProfileModal) viewProfileModal.classList.add('hidden');
});

// Dibujar mensaje en pantalla con foto de perfil
function agregarMensajeEnPantalla(data) {
  const item = document.createElement('li');
  item.dataset.username = data.user;

  const avatarImg = document.createElement('img');
  avatarImg.className = 'avatar-small message-avatar';
  avatarImg.src = obtenerUrlAvatar(data.avatar, data.user);
  avatarImg.alt = data.user;
  avatarImg.addEventListener('click', () => abrirPerfilDeUsuario(data.user));

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  const autor = document.createElement('span');
  autor.className = 'message-author';
  autor.textContent = data.user;
  autor.addEventListener('click', () => abrirPerfilDeUsuario(data.user));

  const texto = document.createElement('span');
  texto.className = 'message-text';
  texto.textContent = data.text;

  contentDiv.appendChild(autor);
  contentDiv.appendChild(texto);

  item.appendChild(avatarImg);
  item.appendChild(contentDiv);

  messagesList.appendChild(item);
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Conectar Socket.io y mostrar la interfaz del chat
function iniciarChat(token, username) {
  authContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');
  currentUserSpan.textContent = username;
  currentUserAvatar.src = obtenerUrlAvatar(localStorage.getItem('avatar'), username);

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

  // Actualizar avatares en pantalla en tiempo real cuando alguien edita su foto
  socket.on('perfil actualizado', ({ username: userEditado, avatar }) => {
    const nuevaUrl = obtenerUrlAvatar(avatar, userEditado);
    document.querySelectorAll(`#messages li[data-username="${CSS.escape(userEditado)}"] .message-avatar`)
      .forEach((img) => {
        img.src = nuevaUrl;
      });
  });

  socket.on('connect_error', () => {
    cerrarSesion();
  });
}

// Abrir modal de Editar Mi Perfil
openEditProfileBtn.addEventListener('click', () => {
  const username = localStorage.getItem('username');
  const avatar = localStorage.getItem('avatar') || '';
  const bio = localStorage.getItem('bio') || '';

  nuevoAvatarBase64 = undefined;
  editProfileError.textContent = '';
  editAvatarPreview.src = obtenerUrlAvatar(avatar, username);
  editBioInput.value = bio;
  avatarFileInput.value = '';
  editProfileModal.classList.remove('hidden');
});

cancelEditProfileBtn.addEventListener('click', () => {
  editProfileModal.classList.add('hidden');
});

editProfileModal.addEventListener('click', (e) => {
  if (e.target === editProfileModal) editProfileModal.classList.add('hidden');
});

// Previsualizar imagen seleccionada
avatarFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    nuevoAvatarBase64 = await procesarImagen(file);
    editAvatarPreview.src = nuevoAvatarBase64;
  } catch (err) {
    editProfileError.textContent = 'No se pudo procesar esa imagen.';
  }
});

// Guardar cambios de perfil en el servidor
editProfileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  editProfileError.textContent = '';

  const token = localStorage.getItem('token');
  const payload = { bio: editBioInput.value };
  if (nuevoAvatarBase64 !== undefined) {
    payload.avatar = nuevoAvatarBase64;
  }

  try {
    const respuesta = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const datos = await respuesta.json();
    if (!respuesta.ok) {
      editProfileError.textContent = datos.error || 'Error al guardar perfil.';
      return;
    }

    localStorage.setItem('avatar', datos.avatar || '');
    localStorage.setItem('bio', datos.bio || '');
    currentUserAvatar.src = obtenerUrlAvatar(datos.avatar, datos.username);
    editProfileModal.classList.add('hidden');
  } catch (err) {
    editProfileError.textContent = 'Error de conexión al guardar.';
  }
});

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
  localStorage.removeItem('avatar');
  localStorage.removeItem('bio');
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

// Comprobar sesión guardada al cargar
const tokenGuardado = localStorage.getItem('token');
const usuarioGuardado = localStorage.getItem('username');

if (tokenGuardado && usuarioGuardado) {
  iniciarChat(tokenGuardado, usuarioGuardado);
}