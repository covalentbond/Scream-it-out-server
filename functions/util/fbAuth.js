// This assures that the user is logged in

const { admin, db } = require("../util/admin");

exports.FBAuth = (req, res, next) => {
  //FBAuth: FireBaseAuth is the middleware
  let idToken;
  if (
    //Headers in a HTTP request or response is the additional information that is transferred to the user or the server.
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ") //Convention to start w Bearer
  ) {
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else {
    console.error("No token found");
    return res.status(403).json({ error: "Unauthorized" });
    //FIXME: Create a login first pop up
  }

  admin
    .auth()
    .verifyIdToken(idToken)
    .then((decodedToken) => {
      req.user = decodedToken;
      // decodedToken is an object of all the information of the user like authtime, email, user_id, uid etc...

      return db
        .collection("users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get(); //returns the results as a QuerySnapshot
    })
    .then((data) => {
      //data is query Snapshot
      req.user.handle = data.docs[0].data().handle; // data.docs mean An array of all the documents in the QuerySnapshot.
      req.user.imageUrl = data.docs[0].data().imageUrl;
      return next();
    })
    .catch((err) => {
      console.error("Error while verifying token ", err);
      return res.status(403).json(err);
    });
};

// Decoded Token Log
// {
//   >    iss: 'https://securetoken.google.com/social-media-app-132cc',
//   >    aud: 'social-media-app-132cc',
//   >    auth_time: 1595250356,
//   >    user_id: 'b43AYRV2hhU3ANG3g08XBvq0N773',
//   >    sub: 'b43AYRV2hhU3ANG3g08XBvq0N773',
//   >    iat: 1595250356,
//   >    exp: 1595253956,
//   >    email: 'dd@gmail.com',
//   >    email_verified: false,
//   >    firebase: { identities: { email: [Array] }, sign_in_provider: 'password' },
//   >    uid: 'b43AYRV2hhU3ANG3g08XBvq0N773'
//   >  }

// data.docs
//
// >  data.docs: [
// >    QueryDocumentSnapshot {
// >      _fieldsProto: {
// >        handle: [Object],
// >        createdAt: [Object],
// >        email: [Object],
// >        userId: [Object]
// >      },
// >      _ref: DocumentReference {
// >        _firestore: [Firestore],
// >        _path: [QualifiedResourcePath],
// >        _converter: [Object]
// >      },
// >      },
// >      _serializer: Serializer { createReference: [Function], allowUndefined: false },
// >      _readTime: Timestamp { _seconds: 1595251610, _nanoseconds: 912927000 },
// >      _createTime: Timestamp { _seconds: 1595211598, _nanoseconds: 157474000 },
// >      _updateTime: Timestamp { _seconds: 1595211598, _nanoseconds: 157474000 }
// >  ]
