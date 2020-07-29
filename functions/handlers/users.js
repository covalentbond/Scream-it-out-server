const { admin, db } = require("../util/admin");

const config = require("../util/config");

const firebase = require("firebase");
firebase.initializeApp(config);

const {
  validateSignupData,
  validateLoginData,
  reduceUserDetails
} = require("../util/validators");

//TODO: Sign user up
exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle
  };

  const { valid, errors } = validateSignupData(newUser); //destructuring
  if (!valid) return res.status(400).json(errors);

  const noImg = "no-img.png";

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
      //Means for all Authentiacted data present it will..
      userId = data.user.uid; // Get a property as userId in the particular user fieled data
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        //TODO Append token to imageUrl. Work around just add token from image in storage.
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        userId //Shorthand for userId: userId
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
};

//TODO: Login user
exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  };

  const { valid, errors } = validateLoginData(user);
  if (!valid) return res.status(400).json(errors);

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
      // if (err.code === "auth/wrong-password") {
      return res
        .status(403)
        .json({ general: "Wrong credentials, please try again." });
      // } else return res.status(500).json({ error: err.code });
    });
};

//TODO: Add user details: bio, website, location

exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);

  db.doc(`/users/${req.user.handle}`)
    .update(userDetails)
    .then(() => {
      return res.json({ message: "Details added successfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//TODO: Showing own user details A to Z

exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.handle}`)
    .get()
    .then((doc) => {
      console.log(doc);
      //App was crashing w/o doc.exists
      if (doc.exists) {
        userData.credentials = doc.data();

        // This do not adds the collection like to our database (on fly basically)
        return db
          .collection("likes")
          .where("userHandle", "==", req.user.handle)
          .get();
      }
    })
    .then((data) => {
      console.log(data);
      userData.likes = [];
      data.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      // return res.json(userData);
      return db
        .collection("notifications")
        .where("recipient", "==", req.user.handle)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
    })
    .then((data) => {
      userData.notifications = [];
      data.forEach((doc) => {
        userData.notifications.push({
          recipient: doc.data().recipient,
          sender: doc.data().sender,
          createdAt: doc.data().createdAt,
          screamId: doc.data().screamId,
          type: doc.data().type,
          read: doc.data().read,
          notificationId: doc.id
        });
      });
      return res.json(userData);
    })

    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//TODO: Get any user's details
exports.getUserDetails = (req, res) => {
  let userData = {};

  db.doc(`/users/${req.params.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.user = doc.data();
        return db
          .collection("screams")
          .where("userHandle", "==", req.params.handle)
          .orderBy("createdAt", "desc")
          .get();
      } else {
        return res.status(404).json({ errror: "User not found" });
      }
    })
    .then((data) => {
      userData.screams = [];
      data.forEach((doc) => {
        userData.screams.push({
          body: doc.data().body,
          createdAt: doc.data().createdAt,
          userHandle: doc.data().userHandle,
          userImage: doc.data().userImage,
          likeCount: doc.data().likeCount,
          commentCount: doc.data().commentCount,
          screamId: doc.id
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//TODO: Upload a profile image for user

exports.uploadImage = (req, res) => {
  const BusBoy = require("busboy");

  // These below are default node modules
  const path = require("path");
  const os = require("os");
  const fs = require("fs");

  const busboy = new BusBoy({ headers: req.headers });

  let imageToBeUploaded = {};
  let imageFileName;
  // String for image token
  // let generatedToken = uuid();

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    console.log(fieldname, file, filename, encoding, mimetype);

    if (
      mimetype !== "image/jpeg" &&
      mimetype !== "image/png" &&
      mimetype !== "image/jpg"
    ) {
      return res.status(400).json({ error: "Wrong file type submitted" });
    }

    // my.image.png => ['my', 'image', 'png']
    const imageExtension = filename.split(".")[filename.split(".").length - 1];

    // 32756238461724837.png
    imageFileName = `${Math.round(
      Math.random() * 10000000000000000
    ).toString()}.${imageExtension}`;

    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });

  busboy.on("finish", () => {
    admin
      .storage()
      .bucket(config.storageBucket)
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype
            //Generate token to be appended to imageUrl
            // firebaseStorageDownloadTokens: generatedToken,
          }
        }
      })
      .then(() => {
        // Append token to url
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`; // w/o: alt=media it will dowload
        // const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media&token=${generatedToken}`;
        return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: "image uploaded successfully" });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: "something went wrong" });
      });
  });
  busboy.end(req.rawBody);
};

exports.markNotificationsRead = (req, res) => {
  let batch = db.batch();
  req.body.forEach((notificationId) => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true });
  });
  batch
    .commit()
    .then(() => {
      return res.json({ message: "Notifications marked read" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
//getAuthentiacted User

// {
//   "credentials": {
//       "createdAt": "2020-07-20T21:34:24.288Z",
//       "imageUrl": "https://firebasestorage.googleapis.com/v0/b/social-media-app-132cc.appspot.com/o/no-img.png?alt=media",
//       "userId": "NbnV2mI9dvNtcc3nGVLtzKzPJLA2",
//       "bio": "Hey",
//       "website": "http://abc.com",
//       "location": "India",
//       "email": "hh@gmail.com",
//       "handle": "hh"
//   },
//   "likes": [],
//    notifications": [
//   {
//     "recipient": "dd",
//     "sender": "ff",
//     "createdAt": "2020-07-22T02:00:45.863Z",
//     "screamId": "1CJkzq80n5Rr2807lxsO",
//     "type": "comment",
//     "read": false,
//     "notificationId": "NRGUF26hW9bISuW4H2sd"
//  }
//  ]
//  }

// Get user Details
// {
//   "user": {
//       "createdAt": "2020-07-20T02:19:57.777Z",
//       "handle": "dd",
//       "userId": "b43AYRV2hhU3ANG3g08XBvq0N773",
//       "email": "dd@gmail.com"
//   },
//   "screams": [
//       {
//           "body": "Another Scream was submitted by dd!",
//           "createdAt": "2020-07-20T02:38:15.972Z",
//           "userHandle": "dd",
//           "userImage": "https://firebasestorage.googleapis.com/v0/b/social-media-app-132cc.appspot.com/o/no-img.png?alt=media",
//           "likeCount": 2,
//           "commentCount": 2,
//           "screamId": "1CJkzq80n5Rr2807lxsO"
//       }
//   ]
// }

//doc
// QueryDocumentSnapshot {
//   >    _fieldsProto: {
//   >      bio: { stringValue: 'Hey', valueType: 'stringValue' },
//   >      email: { stringValue: 'hh@gmail.com', valueType: 'stringValue' },
//   >      userId: {
//   >        stringValue: 'NbnV2mI9dvNtcc3nGVLtzKzPJLA2',
//   >        valueType: 'stringValue'
//   >      },
//   >      imageUrl: {
//   >        stringValue: 'https://firebasestorage.googleapis.com/v0/b/social-media-app-132cc.appspot.com/o/no-img.png?alt=media',
//   >        valueType: 'stringValue'
//   >      },
//   >      location: { stringValue: 'India', valueType: 'stringValue' },
//   >      website: { stringValue: 'http://abc.com', valueType: 'stringValue' },
//   >      createdAt: {
//   >        stringValue: '2020-07-20T21:34:24.288Z',
//   >        valueType: 'stringValue'
//   >      },
//   >      handle: { stringValue: 'hh', valueType: 'stringValue' }
//   >    },
//   >    _ref: DocumentReference {
//   >      _firestore: Firestore {
//   >        _settings: [Object],
//   >        _settingsFrozen: true,
//   >        _serializer: [Serializer],
//   >        _projectId: 'social-media-app-132cc',
//   >        registeredListenersCount: 0,
//   >        _lastSuccessfulRequest: 1595284993879,
//   >        _backoffSettings: [Object],
//   >        _preferTransactions: false,
//   >        _clientPool: [ClientPool]
//   >      },
//   >      _path: ResourcePath { segments: [Array] },
//   >      _converter: {
//   >        toFirestore: [Function: toFirestore],
//   >        fromFirestore: [Function: fromFirestore]
//   >      }
//   >    },
//   >    _serializer: Serializer { createReference: [Function], allowUndefined: false },
//   >    _readTime: Timestamp { _seconds: 1595284993, _nanoseconds: 4262000 },
//   >    _createTime: Timestamp { _seconds: 1595280863, _nanoseconds: 820344000 },
//   >    _updateTime: Timestamp { _seconds: 1595280961, _nanoseconds: 229338000 }
//   >  }

// data
// >  QuerySnapshot {
//   >    _query: Query {
//   >      _firestore: Firestore {
//   >        _settings: [Object],
//   >        _settingsFrozen: true,
//   >        _serializer: [Serializer],
//   >        _projectId: 'social-media-app-132cc',
//   >        registeredListenersCount: 0,
//   >        _lastSuccessfulRequest: 1595284994340,
//   >        _backoffSettings: [Object],
//   >        _preferTransactions: false,
//   >        _clientPool: [ClientPool]
//   >      },
//   >      _queryOptions: QueryOptions {
//   >        parentPath: [ResourcePath],
//   >        collectionId: 'likes',
//   >        converter: [Object],
//   >        allDescendants: false,
//   >        fieldFilters: [Array],
//   >        fieldOrders: [],
//   >        startAt: undefined,
//   >        endAt: undefined,
//   >        limit: undefined,
//   >        limitType: undefined,
//   >        offset: undefined,
//   >        projection: undefined
//   >      },
//   >      _serializer: Serializer { createReference: [Function], allowUndefined: false },
//   >      _allowUndefined: false
//   >    },
//   >      _firestore: Firestore {
//   >        _settings: [Object],
//   >        _settingsFrozen: true,
//   >        _serializer: [Serializer],
//   >        _projectId: 'social-media-app-132cc',
//   >        registeredListenersCount: 0,
//   >        _lastSuccessfulRequest: 1595284994340,
//   >        _backoffSettings: [Object],
//   >        _preferTransactions: false,
//   >        _clientPool: [ClientPool]
//   >      },
//   >      _queryOptions: QueryOptions {
//   >        parentPath: [ResourcePath],
//   >        collectionId: 'likes',
//   >        converter: [Object],
//   >        allDescendants: false,
//   >        fieldFilters: [Array],
//   >        fieldOrders: [],
//   >        startAt: undefined,
//   >        endAt: undefined,
//   >        limit: undefined,
//   >        limitType: undefined,
//   >        offset: undefined,
//   >        projection: undefined
//   >      },
//   >      _serializer: Serializer { createReference: [Function], allowUndefined: false },
//   >      _allowUndefined: false
//   >    },
//   >    _readTime: Timestamp { _seconds: 1595284993, _nanoseconds: 392887000 },
//   >    _size: 0,
//   >    _materializedDocs: null,
//   >    _materializedChanges: null,
//   >    _docs: [Function],
//   >    _changes: [Function]
//   >  }
