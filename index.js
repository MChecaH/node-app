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
	res.sendFile(path.join(__dirname, "/public/ratings.html"));
});

// Request handler
let loginKey = null;
app.post("/", (req, res) => {
	// DEBUG CONNECTION
	console.log("Incoming connection from: " + req.ip + ":" + req.port);
	console.log("With contents: " + req.body.key);

	// Set the current session key to the first request
	if (loginKey === null) {
		loginKey = req.body.key;
		res.redirect("http://localhost:3000/");
	}

	// Route to Reviews / Ratings
	if (req.body.action === "reviews" && loginKey === "key1")
		res.redirect("/reviews");
	else if (
		req.body.action === "ratings" &&
		(loginKey === "key1" || loginKey === "key2")
	)
		res.redirect("/ratings");
	else res.sendStatus(401);
});
