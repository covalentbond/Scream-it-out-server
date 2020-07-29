const { db } = require("../util/admin");

//TODO: Get All Screams
exports.getAllScreams = (req, res) => {
  db.collection("screams")
    .orderBy("createdAt", "desc")
    .get()
    .then((data) => {
      // data is a querySnapShot type which has various document init
      let screams = [];
      data.forEach((doc) => {
        //doc is the query snapshot of that particular document
        screams.push({
          ...doc.data(), // function that returns the data inside the document; an object
          screamId: doc.id,
        });
      });
      return res.json(screams);
    })
    .catch((err) => console.error(err));
};

// While storing the scream data we dont save scream ID in it as a property, we have the doc name as scream ID === doc.id
// Insted while showing or getting the scream we insert scream.id init and call while res.json to us

//TODO: Post Scream
exports.postOneScream = (req, res) => {
  if (req.body.body.trim() === "") {
    return res.status(400).json({
      //400 means client error
      body: "Body must not be empty",
    });
  }
  const newScream = {
    body: req.body.body, // first body is the body of the request and the .body is the property in the body of req
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
  };

  db.collection("screams")
    .add(newScream)
    .then((doc) => {
      //AS we dont k what the screamId would be so in resScream now we get screamId also
      const resScream = newScream;
      resScream.screamId = doc.id;
      res.json(resScream);
      // res.json({ message: `Document ${doc.id} created successfully` });
    })
    .catch((err) => {
      res.status(500).json({ error: "Something went wrong" });
      console.error(err);
    });
};

//TODO: Entering Comment on a comment: Only the comment is expected from the user.
exports.commentOnScream = (req, res) => {
  if (req.body.body.trim() === "")
    return res.status(400).json({ comment: "Must not be empty" });

  const newComment = {
    body: req.body.body,
    createdAt: new Date().toISOString(),
    screamId: req.params.screamId,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
  };
  console.log(newComment);

  db.doc(`/screams/${req.params.screamId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Scream not found" });
      }
      return doc.ref.update({ commentCount: doc.data().commentCount + 1 }); //FIXME: Why used ref here?
    })
    .then(() => {
      return db.collection("comments").add(newComment);
    })
    .then(() => {
      res.json(newComment);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: "Something went wrong" });
    });
};

// In db.collection("comments") there are various documents we want to select only those whose id matches

// doc is the query snapshot and doc.data() makes it an object with all the field info.

//TODO:  Fetch that specific scream with comments on it
exports.getScream = (req, res) => {
  let screamData = {};
  db.doc(`/screams/${req.params.screamId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Scream not found" });
      }
      screamData = doc.data();
      screamData.screamId = doc.id;
      return db
        .collection("comments")
        .orderBy("createdAt", "desc")
        .where("screamId", "==", req.params.screamId)
        .get();
    })
    .then((data) => {
      screamData.comments = [];
      data.forEach((doc) => {
        screamData.comments.push(doc.data());
      });
      return res.json(screamData);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

//TODO: Like a scream
exports.likeScream = (req, res) => {
  const likeDocument = db
    .collection("likes")
    .where("userHandle", "==", req.user.handle)
    .where("screamId", "==", req.params.screamId)
    .limit(1);

  const screamDocument = db.doc(`/screams/${req.params.screamId}`);

  let screamData;

  screamDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        screamData = doc.data();
        screamData.screamId = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: "Scream not found" });
      }
    })
    .then((data) => {
      // data of that person liking that post
      if (data.empty) {
        return db
          .collection("likes")
          .add({
            screamId: req.params.screamId,
            userHandle: req.user.handle,
          })
          .then(() => {
            screamData.likeCount++;
            return screamDocument.update({ likeCount: screamData.likeCount });
          })
          .then(() => {
            return res.json(screamData);
          });
      } else {
        return res.status(400).json({ error: "Scream already liked" });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

//TODO: Unlike Scream
exports.unlikeScream = (req, res) => {
  const likeDocument = db
    .collection("likes")
    .where("userHandle", "==", req.user.handle)
    .where("screamId", "==", req.params.screamId)
    .limit(1);

  const screamDocument = db.doc(`/screams/${req.params.screamId}`);

  let screamData;

  screamDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        screamData = doc.data();
        screamData.screamId = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: "Scream not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return res.status(400).json({ error: "Scream not liked" });
      } else {
        return db
          .doc(`/likes/${data.docs[0].id}`)
          .delete()
          .then(() => {
            screamData.likeCount--;
            return screamDocument.update({ likeCount: screamData.likeCount });
          })
          .then(() => {
            res.json(screamData);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

// TODO: Delete a scream
exports.deleteScream = (req, res) => {
  const document = db.doc(`/screams/${req.params.screamId}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Scream not found" });
      }
      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: "Unauthorized" });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      res.json({ message: "Scream deleted successfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//Like a scream
// {
//   "createdAt": "2020-07-21T12:11:43.728Z",
//   "userHandle": "hh",
//   "likeCount": 2,
//   "userImage": "https://firebasestorage.googleapis.com/v0/b/social-media-app-132cc.appspot.com/o/no-img.png?alt=media",
//   "commentCount": 3,
//   "body": "Scream by hh",
//   "screamId": "3FwEihwNnZONbxVMyprb"
// }

//Comment on Comment
// newComment
// {
//   "body": "Hello from HH",
//   "createdAt": "2020-07-21T01:36:53.486Z",
//   "screamId": "3FwEihwNnZONbxVMyprb",
//   "userHandle": "hh",
//   "userImage": "https://firebasestorage.googleapis.com/v0/b/social-media-app-132cc.appspot.com/o/no-img.png?alt=media"
// }

//GET SCREAM SAMPLE
// {
//   "createdAt": "2020-07-21T01:26:05.893Z",
//   "body": "Scream by hh",
//   "userHandle": "hh",
//   "screamId": "3FwEihwNnZONbxVMyprb",
//   "comments": [
//       {
//           "createdAt": "2020-07-21T01:27:33.581Z",
//           "userHandle": "hh",
//           "userImage": "https://firebasestorage.googleapis.com/v0/b/social-media-app-132cc.appspot.com/o/no-img.png?alt=media",
//           "screamId": "3FwEihwNnZONbxVMyprb",
//           "body": "Comment from hh"
//       },
//       {
//           "userHandle": "hh",
//           "createdAt": "2020-07-21T01:26:20.821Z",
//           "userImage": "https://firebasestorage.googleapis.com/v0/b/social-media-app-132cc.appspot.com/o/no-img.png?alt=media",
//           "body": "Scream 2 by hh",
//           "screamId": "3FwEihwNnZONbxVMyprb"
//       }
//   ]
// }
