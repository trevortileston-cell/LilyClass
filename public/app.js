const startCameraBtn = document.getElementById('start-camera');
const captureBtn = document.getElementById('capture');
const retakeBtn = document.getElementById('retake');
const generateBtn = document.getElementById('generate');
const videoEl = document.getElementById('camera-stream');
const canvasEl = document.getElementById('snapshot');
const placeholderEl = document.getElementById('camera-placeholder');
const hintEl = document.getElementById('camera-hint');
const resultsEl = document.getElementById('results');
const confidenceEl = document.getElementById('confidence');
const loaderTemplate = document.getElementById('loader-template');
const errorTemplate = document.getElementById('error-template');

const state = {
  stream: null,
  imageData: null
};

function setResultsContent(contentNode) {
  resultsEl.innerHTML = '';
  resultsEl.appendChild(contentNode);
}

function showPlaceholder(text) {
  const placeholder = document.createElement('p');
  placeholder.className = 'results__placeholder';
  placeholder.textContent = text;
  setResultsContent(placeholder);
}

function showLoader() {
  const loader = loaderTemplate.content.cloneNode(true);
  setResultsContent(loader);
}

function showError(message) {
  const clone = errorTemplate.content.cloneNode(true);
  clone.querySelector('#error-text').textContent = message;
  setResultsContent(clone);
}

function stopStream() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
}

async function startCamera() {
  try {
    stopStream();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment'
      },
      audio: false
    });
    state.stream = stream;
    videoEl.srcObject = stream;
    videoEl.style.display = 'block';
    placeholderEl.style.display = 'none';
    canvasEl.style.display = 'none';
    captureBtn.disabled = false;
    retakeBtn.disabled = true;
    generateBtn.disabled = true;
    state.imageData = null;
    hintEl.textContent = 'When you are ready, press Capture Photo.';
  } catch (error) {
    showError('Lily could not open the camera. Check permissions and try again.');
  }
}

function capturePhoto() {
  if (!state.stream) {
    showError('Please start the camera first.');
    return;
  }

  const trackSettings = state.stream.getVideoTracks()[0]?.getSettings() || {};
  const width = trackSettings.width || videoEl.videoWidth || 640;
  const height = trackSettings.height || videoEl.videoHeight || 480;

  canvasEl.width = width;
  canvasEl.height = height;

  const context = canvasEl.getContext('2d');
  context.drawImage(videoEl, 0, 0, width, height);

  state.imageData = canvasEl.toDataURL('image/png');
  canvasEl.style.display = 'block';
  videoEl.style.display = 'none';
  captureBtn.disabled = true;
  retakeBtn.disabled = false;
  generateBtn.disabled = false;
  hintEl.textContent = 'Great capture! Share it with Lily to get new challenges.';
}

function retakePhoto() {
  if (!state.stream) {
    startCamera();
    return;
  }

  videoEl.style.display = 'block';
  canvasEl.style.display = 'none';
  captureBtn.disabled = false;
  retakeBtn.disabled = true;
  generateBtn.disabled = true;
  hintEl.textContent = 'Adjust your page and try capturing again when ready.';
}

async function requestAdvancedQuestions() {
  if (!state.imageData) {
    showError('Please capture a photo of your work first.');
    return;
  }

  showLoader();
  generateBtn.disabled = true;
  captureBtn.disabled = true;

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageData: state.imageData,
        studentLevel: confidenceEl.value
      })
    });

    if (!response.ok) {
      const text = await response.text();
      showError(`Lily ran into a problem (${response.status}). ${text}`);
      generateBtn.disabled = false;
      return;
    }

    const data = await response.json();
    const message = data?.message;

    if (!message) {
      showError('Lily could not understand the response. Please try again.');
      generateBtn.disabled = false;
      return;
    }

    const output = document.createElement('article');
    output.className = 'results__answer';
    output.innerHTML = message
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br />');
    output.innerHTML = `<p>${output.innerHTML}</p>`;
    setResultsContent(output);
  } catch (error) {
    showError('We lost connection to Lily. Check your internet and try again.');
  } finally {
    generateBtn.disabled = false;
  }
}

startCameraBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', capturePhoto);
retakeBtn.addEventListener('click', retakePhoto);
generateBtn.addEventListener('click', requestAdvancedQuestions);

showPlaceholder('Your advanced questions will appear here.');
