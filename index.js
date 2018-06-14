// var restify = require('restify');
const CONSTANTS = require('./CONSTANTS.js');
const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const fs = require('fs');
const encryptionUtility = require('./encryptionUtility.js');
const sendgridMailer = require('./sendgridMailer.js');
const { check, validationResult } = require('express-validator/check');
const { matchedData, sanitize } = require('express-validator/filter');
const dbclient = require('mongodb').MongoClient;
const PORT = process.env.PORT || 3000

console.log(JSON.stringify(JSON.parse(process.env.ENC_KEY)));

var webapp = express();

webapp.use(bodyParser.json());
webapp.use(bodyParser.urlencoded({ extended: true }));


// Web pages
webapp
  .use(express.static(path.join(__dirname, 'public')))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', (req, res) => res.render('pages/index'));

webapp.get('/test', (req, res) => {
	console.log('Cipher-decipher ' + encryptionUtility.decypher(encryptionUtility.cypher(req.query.r)));
});

// Process referrals
webapp.get('/r', (req, res) => {
	console.log('index.get(/r): servicing referral request from user ' + encryptionUtility.decypher(req.query.r));
	res.writeHead(302, {
      'Location': '/waitinglist.html?referer_token=' + req.query.r
      //add other headers here...
    });
    res.end();
});


// Send email to waiting list
webapp.post('/api/lead', 
	// Validators
	[

	check('email').isEmail().withMessage('Is not a valid email.'),
	check('name').exists().custom((value) => value.length > 0).withMessage('The name is empty')

	],
	// Request processing
	(req, res) => {

		errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(422).json({ code: 422, messages: errors.mapped() });
		} else {

			var email = req.body.email;
			var name = req.body.name;
			console.log('Received referer token: ' + req.body.referer_token);
			var refererDatastructure = (encryptionUtility.decypher(req.body.referer_token));
			var refererId = (refererDatastructure == null) ? null : JSON.parse(refererDatastructure).id;
			console.log('index.post(/api/lead): lead refered by user ' + refererId);
			// DB checking
			dbclient.connect(CONSTANTS.MONGODB_URL, function(dbConnectionErr, db) {
		        if (dbConnectionErr) { // Crash connecting to the database 
		        	console.log('index.post(/api/lead): could not connect to the database to validate ' + email + ' due to ' + dbConnectionErr);
		        	throw new Error('index.post(/api/lead): internal server error.');
		        } else {
			        var dbo = db.db(CONSTANTS.DATABASE_NAME);
			        dbo.collection(CONSTANTS.SENT_EMAILS_TABLE).findOne({ email: email }, function(err, result) {
			        	if (err) { // Crash finding the email in the database
			        		console.log('index.post(/api/lead): error finding email ' + email);
			        		throw err;
			        	} else {				       
				        	if (result != null) {
				        		return res.status(409).json({ code: 409, messages: ['email already exists'] });
				        	} else {
				        		sendgridMailer.sendWaitingListEmail(name, email, refererId, res);
				        	}
				        }
			        	db.close();
			        });
		    	}
		    });
		}
	}
);


webapp.get('/api/lead/confirm', 
	// Validators
	[

	check('email').isEmail().withMessage('Is not a valid email.')

	],
	(req, res) => {
	console.log('index.get(/api/lead/confirm): servicing confirmation request for ' + req.query.email);
	sendgridMailer.confirmEmail(req.query.email, null, res);
});


// And starting!
webapp.listen(PORT, () => console.log(`Listening on ${ PORT }`));