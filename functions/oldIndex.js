const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firebase = require("firebase");
const express = require("express");
const app = express();

var serviceAccount = require("./admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://social-media-app-132cc.firebaseio.com",
});

const firebaseConfig = {
  apiKey: "AIzaSyBSRWWdk4H2vtCXsSZEBqhSVBsrvmUjgd4",
  authDomain: "social-media-app-132cc.firebaseapp.com",
  databaseURL: "https://social-media-app-132cc.firebaseio.com",
  projectId: "social-media-app-132cc",
  storageBucket: "social-media-app-132cc.appspot.com",
  messagingSenderId: "76413117071",
  appId: "1:76413117071:web:e337846ab8f5c76a24c6fa",
  measurementId: "G-MTSVLFDVLL",
};

firebase.initializeApp(firebaseConfig);

const db = admin.firestore();

//Getting DATA
app.get("/screams", (req, res) => {
  // REF 1
  db.collection("screams")
    .orderBy("createdAt", "desc")
    .get()
    .then((data) => {
      // this is a querySnapShot type which has doc init
      let screams = [];
      data.forEach((doc) => {
        //doc is the array
        screams.push({
          ...doc.data(), // function that returns the data inside the document
          screamId: doc.id,
        });
      });
      return res.json(screams);
    })
    .catch((err) => console.error(err));
});

//Creating DATA
const FBAuth = (req, res, next) => {
  //FBAuth: FireBaseAuth is the middleware
  let idToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ") //Convention to start w Bearer
  ) {
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else {
    console.error("No token found");
    return res.status(403).json({ error: "Unauthorized" });
  }

  admin
    .auth()
    .verifyIdToken(idToken)
    .then((decodedToken) => {
      req.user = decodedToken;
      console.log(decodedToken);
      return db
        .collection("users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get();
    })
    .then((data) => {
      req.user.handle = data.docs[0].data().handle; // docs mean An array of all the documents in the QuerySnapshot.
      return next();
    })
    .catch((err) => {
      console.error("Error while verifying token ", err);
      return res.status(403).json(err);
    });
};

// Posting Screams
app.post("/screams", FBAuth, (req, res) => {
  if (req.body.body.trim() === "") {
    return res.status(400).json({
      //400 means client error
      body: "Body must not be empty",
    });
  }
  const newScream = {
    body: req.body.body, // first body is the body of the request and the .body is the property in the body of req
    userHandle: req.user.handle,
    createdAt: new Date().toISOString(),
  };

  db.collection("screams")
    .add(newScream)
    .then((doc) => {
      res.json({ message: `document ${doc.id} created successfully` });
    })
    .catch((err) => {
      res.status(500).json({ error: "Something went wrong" });
      console.error(err);
    });
});

// Signup ROUTE

const isEmail = (email) => {
  const regEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (email.match(regEx)) return true;
  // match is a function that matches reg exps to string
  else return false;
};

const isEmpty = (string) => {
  if (string.trim() === "") return true;
  //Removes the leading and trailing white space
  else return false;
};

app.post("/signup", (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  let errors = {};

  if (isEmpty(newUser.email)) {
    errors.email = "Must not be empty";
  } else if (!isEmail(newUser.email)) {
    errors.email = "Must be a valid email address";
  }

  if (isEmpty(newUser.password)) errors.password = "Must not be empty";
  if (newUser.password !== newUser.confirmPassword)
    errors.confirmPassword = "Passwords must match";
  if (isEmpty(newUser.handle)) errors.handle = "Must not be empty";

  if (Object.keys(errors).length > 0) {
    return res.status(400).json(errors);
  }

  // TODO: validate data

  let token, userId;
  db.doc(`/users/${newUser.handle}`) //In collection users Document of handle will be formed
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(400).json({ handle: "This handle is already taken" });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        userId,
      };
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ email: "Email is already is use" });
      } else {
        return res
          .status(500)
          .json({ general: "Something went wrong, please try again" });
      }
    });
});

// LOGIN ROUTE

app.post("/login", (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };
  let errors = {};

  if (isEmpty(user.email)) errors.email = "Must not be empty";
  if (isEmpty(user.password)) errors.password = "Must not be empty";

  if (Object.keys(errors).length > 0) res.status(400).json(errors);

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token });
    })
    .catch((err) => {
      console.log(err);
      if (err.code === "auth/wrong-password") {
        return res
          .status(403)
          .json({ general: "Wrong credentials, please try again." });
      } else return res.status(500).json({ error: err.code });
    });
});

// https://arijit.com/api/ will helpm crating multiple routes and after /api/
exports.api = functions.https.onRequest(app);

//REF 1 IMPORTANT TODO:

// exports.createScream = functions.https.onRequest((req, res) => {
//   admin
//     .firestore()
//     .collection("screams")
//     .get()
//     .then((data) => {
//       let screams = [];
//       data.forEach((doc) => {
//         screams.push(doc.data()); // NOT Pushing id here
//       });
//     });
// });
