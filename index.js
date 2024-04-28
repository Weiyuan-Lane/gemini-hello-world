const express = require('express');
const {readFileSync} = require('fs');
const handlebars = require('handlebars');

const app = express();
// Serve the files in /assets at the URI /assets.
app.use('/assets', express.static('assets'));

// The HTML content is produced by rendering a handlebars template.
// The template values are stored in global state for reuse.
const data = {
  service: process.env.K_SERVICE || '???',
  revision: process.env.K_REVISION || '???',
};
let template;

app.get('/', async (req, res) => {
  // The handlebars template is stored in global state so this will only once.
  if (!template) {
    // Load Handlebars template from filesystem and compile for use.
    try {
      template = handlebars.compile(readFileSync('index.html.hbs', 'utf8'));
    } catch (e) {
      console.error(e);
      res.status(500).send('Internal Server Error');
    }
  }

  // Apply the template to the parameters to generate an HTML string.
  try {
    const output = template(data);
    res.status(200).send(output);
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal Server Error');
  }
});

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

const {VertexAI} = require('@google-cloud/vertexai');
const marked = require('marked');

// Initialize Vertex with your Cloud project and location
const vertex_ai = new VertexAI({project: 'YOUR-PROJECT', location: 'us-central1'});
const model = 'gemini-1.0-pro-vision-001';

// Instantiate the models
const generativeModel = vertex_ai.preview.getGenerativeModel({
  model: model,
  generationConfig: {
    'maxOutputTokens': 2048,
    'temperature': 0.4,
    'topP': 0.4,
    'topK': 32,
  },
  safetySettings: [
    {
        'category': 'HARM_CATEGORY_HATE_SPEECH',
        'threshold': 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
        'category': 'HARM_CATEGORY_DANGEROUS_CONTENT',
        'threshold': 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
        'category': 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        'threshold': 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
        'category': 'HARM_CATEGORY_HARASSMENT',
        'threshold': 'BLOCK_MEDIUM_AND_ABOVE'
    }
  ],
});

async function generateContent(text) {
  const req = {
    contents: [
      {role: 'user', parts: [{text: text}]}
    ]
  };

  const streamingResp = await generativeModel.generateContentStream(req);
  let output = [];

  for await (const item of streamingResp.stream) {
    const text = item.candidates[0].content.parts[0].text;
    output = `${output}${text}`;
  }

  return output;
}

// Register a "/chat" route for both get and post methods
// Both methods should use handlebars to reference to the "chat.html.hbs" file
app.get('/chat', async (req, res) => {
  try {
    const output = handlebars.compile(readFileSync('chat.html.hbs', 'utf8'))({});
    res.status(200).send(output);
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/chat', async (req, res) => {
  try {
    const chatInput = req.body['chatInput'];
    const chatOutput = await generateContent(chatInput);
    const chatOutputHtml = marked.parse(chatOutput);
    const output = handlebars.compile(readFileSync('chat.html.hbs', 'utf8'))({
      chatInput: chatInput,
      chatOutput: chatOutputHtml,
    });
    res.status(200).send(output);
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal Server Error');
  }
});

// Start the server.
// The PORT environment variable is set by Cloud Run.
// If it is not set, we default to 8080.
// This is the port that the container will listen on.

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(
    `Hello from Cloud Run! The container started successfully and is listening for HTTP requests on ${PORT}`
  );
});
