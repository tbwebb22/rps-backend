// server.js
const express = require('express');
const bodyParser = require('body-parser');
const gameRoutes = require('./routes/gameRoutes');  // Import game routes
require('dotenv').config();  // Load environment variables

const app = express();
app.use(bodyParser.json());  // Parse JSON request bodies

// Set up routes
app.use('/api/games', gameRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
