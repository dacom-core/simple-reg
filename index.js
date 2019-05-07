
require('dotenv').config()
var express = require('express');
var app = express();
var MongoClient = require('mongodb').MongoClient;
var md5 = require('md5');
const sgMail = require('@sendgrid/mail');
const Eos = require('eosjs')

const protocol = process.env.PROTOCOL
const endpoint = process.env.ENDPOINT


var network = {
		  protocol: protocol,
          blockchain: process.env.BLOCKCHAIN,
          host: endpoint, // ( or null if endorsed chainId )
          port: process.env.ENDPORT, // ( or null if defaulting to 80 )
          chainId: process.env.CHAINID,
}


function validateEmail(email) {
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

async function send_error(err){

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log("EMAIL SHOULD BE SENDED")
const msg = {
		  to: process.env.ADMIN,
		  from: 'welcome@dacom.io',
		  subject: 'DACom | ERROR on REGISTRATOR',
		  html: "Please, check it!", 
		 
	};

sgMail.send(msg)

}


async function get_pass_instance(username, wif){
	return Eos({keyProvider: wif, chainId:network.chainId, httpEndpoint: protocol + endpoint, authorization: username + '@active'});
}


function update_user(user,res){
try{
const mongoClient = new MongoClient(process.env.MONGOURI, { useNewUrlParser: true });

  	mongoClient.connect(function(err, client){
 
	    if(err){
			res.send({status: 'error', message:err});
	        throw(err);
	    }
	    
	    const db = client.db()

	    const collection = db.collection("candidates");
	   	user.registered = true
	    collection.updateOne({username: user.username, registered: false}, {$set: {"registered": true}}, (err, item) =>{
	    	if(err){
	    		send_error(err)
	    		console.error(err)
	    		res.send({status: 'error', message:err});
	    	}
	    	else{
	    		console.log("account is registered -> ", user)
	    		res.redirect(process.env.FINISH_URL);
	    		
	    	}

	    })
	    	
	})

	} catch(e){
		console.error(e)
	}
}

async function register(user, res){
	 var eos = await get_pass_instance( process.env.REG_ACCOUNT, process.env.WIF)

 	
      eos.transaction(tr => {
        tr.newaccount({
          creator: process.env.REG_ACCOUNT,
          name: user.username,
          owner: user.owner_pub,
          active: user.active_pub
        })
        tr.buyrambytes({
          payer: process.env.REG_ACCOUNT,
          receiver: user.username,
          bytes: 8192
        })
        
        tr.delegatebw({
          from: process.env.REG_ACCOUNT,
          receiver: user.username,
          stake_net_quantity: process.env.STAKE_NET,
          stake_cpu_quantity: process.env.STAKE_CPU,
          transfer: 0
        })

        	eos.transaction(process.env.CORE_CONTRACT , tr2 => {
       			tr2.reg({
       				username: user.username,
       				referer: user.referer,
       				meta: "{}"
        		})
    		})
      })
      .then((data) => {

        //console.log(JSON.stringify(data));
        update_user(user, res)
        
		    
      }).catch((e) => {
          res.send({status: "error", message: "Troubles on registration. May be account is already registered?"})
          
        });


}

app.get('/confirm', function (req, res) {
  var secret = req.query.secret 
  try{
  const mongoClient = new MongoClient(process.env.MONGOURI, { useNewUrlParser: true });

  	mongoClient.connect(function(err, client){
 
	    if(err){
			res.send({status: 'error', message: err});
	        throw(err);
	    }
	    
	    const db = client.db()

	    const collection = db.collection("candidates");
	    	   
	    collection.findOne({md5: secret ,registered: false}, (err, item) =>{
	    	try{
			    if (err){
		    		send_error(err)
			    	res.send({status: 'error', message:err});
			    } else {
			    	if (!item){
			    		res.send({status: 'error', message: "User is not found or already registered"})
			    	} else{

				    var secret2 = item.md5

					    if (secret == secret2){
					    	if ((item.referer == "") || (!item.referer))
					    		item.referer = process.env.DEFAULT_REF
					    	
					    	register(item, res)
							client.close();
					    	
					    } else {
					    	
							res.send({status: 'error', message:"Wrong secret code"});
					    	client.close();

					    }
				    }
			    }
	    	} catch (err){
	    	res.send({status: "error", message: err})
		    }
	    })

    })
	
	} catch(err){
		res.send({status: "error", message: err})
	}
})

app.get('/set', function (req, res) {
  // res.send('Hello World!');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  
try{
  
	if ((req.query.email)&&(req.query.active_pub )&&(req.query.owner_pub )&&(req.query.username)){		
  
  	const mongoClient = new MongoClient(process.env.MONGOURI, { useNewUrlParser: true });

	mongoClient.connect(function(err, client){
 
	    if(err){
			res.send({status: 'error', message: err});
	        throw(err);
	    }
	    
	    const db = client.db()

	    const collection = db.collection("candidates");

	    let user = req.query
	    user.registered = false

	    user.md5 = md5(req.query.username)
	    
	    
	    if (user.locale == 'ru'){
	    	let body = `Для завершения регистрации, пожалуйста, перейдите по ссылке: <a href='${process.env.CALLBACK}?secret=${user.md5}'>${process.env.CALLBACK}?secret=${user.md5}</a>`
	    
	    	var msg = {
			  to: user.email,
			  from: 'welcome@dacom.io',
			  subject: 'DACom | Требуется подтверждение',
			  html: body,
			};

	    } else {
	    	let body = `For complete registration process, please, follow the link: <a href='${process.env.CALLBACK}?secret=${user.md5}'>${process.env.CALLBACK}?secret=${user.md5}</a>`
	    
	    	var msg = {
			  to: user.email,
			  from: 'welcome@dacom.io',
			  subject: 'DACom | Email confirmation',
			  html: body,
			};
	    }
	    console.log("on register: ", user)

	    collection.findOne({email: user.email}, (err, item) =>{
	    	try{
			    if (err){
		    		send_error(err)
			    	res.send({status: 'error', message:err});
			    } else {
			    	console.log("item on find ", item)
			    	
			    	if (!item){
			    		console.log("INSIDE2")
	    				sgMail.send(msg).then(()=>{
		   
						    collection.insertOne(user, function(err, result){
						        if(err){ 
						        	console.log("error1")
					    	        res.send({status: 'error', message: err});
					    	        
					        	} else{
					        		res.send({status: 'ok'});
					        	}

					        	client.close();
						    
						    });
					   	 console.log('email sended to: ', user.email)

						}).catch(err => {
							res.send({status: 'error', message: err});
							send_error(err)
							console.error(err.toString())
						});
				    } else if(item.registered == true){
				    	console.log("ONHERE")
			    		console.log(item)
			    		res.send({status: 'error', message: "User is already registered"})
			    	
				    }


			    }
	    	} catch (err){
	    	res.send({status: "error", message: err})
		    }
	    })

	})

	} else {
		res.send({status: "error", message: "No argument list"})
	}

} catch (e){
	console.error(e)
	const msg = {
		  to: 'dacom.dark.sun@gmail.com',
		  from: 'welcome@dacom.io',
		  subject: 'DACom | ERROR on send data in database or send mail!',
		  text: "Please, check it!", 
		  html: e,
	};

	sgMail.send(msg)

}
//   	  i
})



app.get('/check', function (req, res) {
  // res.send('Hello World!');

try{
	const mongoClient = new MongoClient(process.env.MONGOURI, { useNewUrlParser: true });

  	mongoClient.connect(function(err, client){
 
	    if(err){
			res.send({status: 'error', message: err});
	    }
	    
	    var email = req.query.email
	    

	    if (!validateEmail(email)) {
		    res.send({status: "error", "message": "email is not valid"});
		    
		 } else {
		    
		 

	    const db = client.db()
	    const collection = db.collection("candidates");

	    collection.findOne({email: email}, (err, item) =>{
	    	try{
			    if (err){
		    		res.send({status: 'error', message:err});
			    } else {
			    	if (item){
			    		res.send({status: 'error', message: "User is already registered"})
			    	} else {
			    		res.send({status: "ok"})
			    	}
			    }
	    	} catch (err){
	    		res.send({status: "error", message: err})
		    }
	    })

	}
})
} catch (e){
	console.error(e)
	const msg = {
		  to: 'dacom.dark.sun@gmail.com',
		  from: 'welcome@dacom.io',
		  subject: 'DACom | ERROR on send data in database or send mail!',
		  text: "Please, check it!", 
		  html: e,
	};

	sgMail.send(msg)

}})


app.listen(5010, function () {
  console.log('Example app listening on port 5010!');
});
