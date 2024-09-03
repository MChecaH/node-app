// Express App init
const express = require("express");
const path = require("path");

const app = express();

let port = 3000;

// JSON parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Start listening requests
app.listen(port, () => {
	console.log("Joined in port:", port);
});

// Routing
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "/public/index.html"));
});

app.get("/reviews", (req, res) => {
	res.sendFile(path.join(__dirname, "/public/reviews.html"));
});

app.get("/ratings", (req, res) => {
	console.log(`USD: ${USD} \nEUR: ${EUR} \nGBP: ${GBP}`);
	res.sendFile(path.join(__dirname, "/public/ratings.html"));
});

// Request handler
let loginKey = null;
let USD, GBP, EUR;
app.post("/", (req, res) => {
	// DEBUG CONNECTION
	console.log("Incoming connection from: " + req.headers.host);
	console.log("With contents: " + JSON.stringify(req.body));

	USD = req.body.USD;
	GBP = req.body.GBP;
	EUR = req.body.EUR;
	loginKey = req.body.key;
	res.redirect("http://localhost:3000/");
});
