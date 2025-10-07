# LilyClass Learning Booster

LilyClass is a playful web application that helps children extend their learning. Kids can snap a photo of what they are working on and Lily – an AI tutor powered by OpenAI – responds with encouragement and three stretch challenges that build on the same concept.

## Features

- 📸 **In-browser camera capture** – no uploading required. Children can take a photo of their worksheet or project directly from the app.
- 🌱 **Personalized growth path** – a quick confidence check helps Lily tailor how advanced the follow-up questions should be.
- 🤖 **OpenAI integration** – forwards the captured image to OpenAI's multimodal endpoint and returns celebratory feedback plus three progressively challenging prompts with gentle hints.
- 🧸 **Kid-friendly interface** – warm colors, simple steps, and accessibility-friendly copy to keep the experience inviting.

## Getting started

1. **Clone the repository** (already done if you're reading this file here).
2. **Add your OpenAI API key** to a `.env` file in the project root:
   ```bash
   echo "OPENAI_API_KEY=your_api_key_here" > .env
   ```
3. **Start the server**:
   ```bash
   npm start
   ```
4. Open your browser to [http://localhost:3000](http://localhost:3000) and follow the on-screen steps.

> **Permissions note:** the app needs access to the device camera. Most browsers require HTTPS or `localhost` for camera access, so run locally or deploy with TLS.

## Deployment

The app ships as a single Node.js server with static files, so you can deploy it to any host that supports long-running Node processes. Below are two common options.

### Option 1: Render/Railway/Fly.io

1. Create a new **Web Service** on your provider and point it at this repository.
2. Set the environment:
   - **Runtime:** Node.js 18 or newer.
   - **Build command:** `npm install` (no packages are installed, but this ensures the platform detects Node).
   - **Start command:** `node server.js`.
3. Add the `OPENAI_API_KEY` environment variable in the dashboard.
4. Deploy. The provider will expose a public HTTPS URL that works with the in-browser camera.

### Option 2: Vercel

1. Run `npm install -g vercel` (if you don’t already have it) and log in with `vercel login`.
2. From the project directory run `vercel --prod` and accept the detected settings:
   - **Framework preset:** `Other`.
   - **Build command:** `npm install`.
   - **Output directory:** leave blank (the server handles static files).
   - **Development command:** `node server.js`.
3. In the Vercel dashboard, add `OPENAI_API_KEY` under **Settings → Environment Variables** and redeploy.

### Using the deployed site

1. Visit the deployment URL on a camera-enabled device.
2. Allow camera permissions when prompted.
3. Capture the learner’s work, choose a confidence level, and press **Ask Lily for advanced questions** to receive Lily’s tailored challenges.

## Environment configuration

- `PORT` (optional): set a custom port for the Node.js server. Defaults to `3000`.
- `OPENAI_API_KEY` (required): OpenAI key with access to the `gpt-4o-mini` (or compatible) multimodal model.

## How it works

1. The browser requests camera access and displays a live preview.
2. When the child captures a snapshot, it is converted to a base64 string and kept client-side.
3. Tapping **Ask Lily for advanced questions** sends the encoded image and chosen confidence level to `/api/analyze`.
4. The Node.js server forwards the information to OpenAI's Responses API and extracts the text output.
5. Lily's response – a celebration plus three advanced questions with hints – is rendered back in the results panel.

If the OpenAI call fails, the UI displays a gentle error card with guidance to try again with adult help.

## Development tips

- The server is dependency-free and relies on Node's built-in `http` module, making it easy to deploy.
- Static assets live in `public/`. Adjust the layout or behavior by editing `public/styles.css` and `public/app.js`.
- To customize Lily's tutoring style, tweak the prompt in `server.js` inside the `tutoringPrompt` array.

## Accessibility and privacy

- The camera view never uploads until a grown-up explicitly asks Lily for new challenges.
- Buttons include clear labels and disabled states to guide the workflow.
- Announcements use ARIA live regions so screen reader users hear when new feedback arrives.

Enjoy watching learners take the next leap! 🌟
