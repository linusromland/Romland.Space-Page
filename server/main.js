const express = require("express");
const dbModule = require("./dbModule");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const Link = require("./models/Link.js");
const url = require("url");
const app = express();
const port = 3000;
const clientdir = __dirname + "/client";
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const UAParser = require("ua-parser-js");
let key;

app.use(express.static(clientdir));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(
	bodyParser.urlencoded({
		extended: true,
	})
);
app.use(cookieParser());
app.set("view engine", "ejs");
connectToMongo("SearchEngine", "mongodb://localhost:27017/");
security();
let ipAdresses = [];

setInterval(() => {
	ipAdresses = [];
}, 3600000);

app.get("/", async (req, res) => {
	res.render("index", {});
});

app.get("/about", async (req, res) => {
	res.render("about", {});
});

app.get("/getSearch", async (req, res) => {
	let url_parts = url.parse(req.url, true);
	let urlquery = url_parts.query;
	let search = urlquery.search ? urlquery.search : "";

	res.setHeader("Content-Type", "application/json");
	let searchThing = await dbModule.getInDBVerified(Link, search);
	res.send(searchThing);
});

app.get("/login", (req, res) => {
	if (req.cookies.authstring && req.cookies.authstring == key) {
		res.redirect("/siteVerification");
	} else {
		res.sendFile(clientdir + "/login.html");
	}
});

app.get("/siteVerification", (req, res) => {
	if (req.cookies.authstring && req.cookies.authstring == key) {
		res.sendFile(clientdir + "/verify.html");
	} else {
		res.redirect("/login");
	}
});

app.post("/changeStatus", async (req, res) => {
	if (req.cookies.authstring && req.cookies.authstring == key) {
		if (req.body.verified == "true") {
			dbModule.updateStatus(Link, req.body.id, true);
		} else if (req.body.verified == "false") {
			dbModule.updateStatus(Link, req.body.id, false);
		} else {
			console.log(req.body.verified);
		}
		res.send("Done");
	} else {
		res.send("No auth");
	}
});

app.post("/editLink", async (req, res) => {
	if (req.cookies.authstring && req.cookies.authstring == key) {
		dbModule.editLink(
			Link,
			req.body.id,
			req.body.name,
			req.body.desc,
			req.body.link
		);

		res.send("Done");
	} else {
		res.send("No auth");
	}
});

app.post("/removeLink", async (req, res) => {
	if (req.cookies.authstring && req.cookies.authstring == key) {
		await dbModule.deleteLink(Link, req.body.id);
		res.send("Done");
	} else {
		res.send("No auth");
	}
});

app.get("/getAll", async (req, res) => {
	if (req.cookies.authstring && req.cookies.authstring == key) {
		let result = await dbModule.getAll(Link);

		res.send(result);
	} else {
		res.send("No auth");
	}
});

app.post("/verify", (req, res) => {
	if (req.body.authstring == key) {
		console.log("Auth success");
		res.clearCookie("authstring");
		res.cookie("authstring", req.body.authstring, { maxAge: 3888000000 });
		res.redirect("/siteVerification");
	} else {
		res.redirect("/");
	}
});

app.get("/insert", (req, res) => res.sendFile(clientdir + "/insert.html"));

app.post("/newLink", async (req, res) => {
	let verified = false;
	if (req.cookies.authstring && req.cookies.authstring == key) {
		verified = true;
	}

	try {
		await dbModule.saveToDB(
			createLink(req.body.name, req.body.link, req.body.desc, verified)
		);
		res.sendStatus(201);
	} catch (error) {
		res.sendStatus(500);
	}
});

app.get("/redirect", (req, res) => {
	res.redirect(req.query.link);
	var parser = new UAParser();
	var ua = req.headers["user-agent"];
	var browserName = parser.setUA(ua).getBrowser().name;
	let allowedBrowser = ["IE", "Firefox", "Chrome", "Safari", "Opera"];
	for (let index = 0; index < allowedBrowser.length; index++) {
		if (allowedBrowser[index] == browserName) {
			let clientAdress = req.headers["x-real-ip"];
			if (!clientAdress) {
				clientAdress = req.connection.remoteAddress;
			}
			let noTurnsLeft = false;
			let alreadyInList = false;
			for (let i = 0; i < ipAdresses.length + 1; i++) {
				if (ipAdresses[i]) {
					if (ipAdresses[i].adress == clientAdress) {
						alreadyInList = i;
						if (ipAdresses[i].amount > 10) {
							noTurnsLeft = true;
							break;
						}
					}
				}
			}

			if (!noTurnsLeft) {
				dbModule.updateHits(Link, req.query.link);
				if (alreadyInList) {
					ipAdresses[alreadyInList].amount =
						ipAdresses[alreadyInList].amount + 1;
				} else {
					ipAdresses.push({
						adress: clientAdress,
						amount: 1,
					});
				}
			}

			break;
		}
	}
});

app.listen(port, () => console.log(`Server listening on port ${port}!`));

async function security() {
	await new Promise((resolve, reject) => {
		if (!fs.existsSync("security/security.txt")) {
			console.log("File doesn't exist");

			fs.writeFile("security/security.txt", generateP(), function (err) {
				if (err) return console.log(err);
				console.log("Created authentication string");
				resolve();
			});
		} else {
			resolve();
		}
	});
	key = fs.readFileSync("./security/security.txt");
}

function generateP() {
	var pass = "";
	var str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	for (var i = 1; i <= 32; i++) {
		var char = Math.floor(Math.random() * str.length + 1);

		pass += str.charAt(char);
	}

	return pass;
}

function connectToMongo(dbName, connectURL) {
	if (fs.existsSync("mongoauth.json")) {
		const mongAuth = require("./mongoauth.json");
		dbModule.cnctDBAuth(dbName, connectURL);
	} else {
		dbModule.cnctDB(dbName, connectURL);
	}
}

function createLink(nameIN, linkIN, descIN, verifiedIN) {
	let tmp = new Link({
		name: nameIN,
		link: linkIN,
		desc: descIN,
		verified: verifiedIN,
		hits: 0,
	});
	return tmp;
}
