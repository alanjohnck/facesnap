const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

const authRoutes = require("./Routers/AuthenticationRoutes/authRoutes");
app.use('/auth',authRoutes);

app.listen(port, '0.0.0.0', ()=>{
    console.log(`Server is running on port ${port}`);
})
