// Vercel Serverless Function entry point.
//
// Vercel discovers any file under `/api/**` and turns it into a Node.js
// serverless function. We re-export the Express application defined in
// `backend/src/server.js` so the same code runs locally (`npm run dev` inside
// `backend/`) and on Vercel without duplication.
//
// The catch-all route in `vercel.json` rewrites every `/api/*` request to this
// function, preserving the original path. Express then handles the routing
// using the `/api/...` paths declared in `server.js`.

import app from '../backend/src/server.js'

export default function handler(req, res) {
  return app(req, res)
}

// Vercel-specific config: increase the response body size limit for endpoints
// that return larger lead/client payloads, and prefer the Node.js runtime.
export const config = {
  api: {
    bodyParser: false, // Express owns body parsing
    responseLimit: '8mb',
  },
}
