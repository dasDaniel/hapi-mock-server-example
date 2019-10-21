const initUserCollection = require("../db/users.json");

// boom is library for HTTP-friendly error reporting. It is a dependency of hapi and doesn't need to be installed
const Boom = require("@hapi/boom");

// joi is for object/schema validation
const Joi = require("@hapi/joi");

// lowdb is the json database
const low = require("lowdb");

// load in-memory adapter for lowdb. This will keep changes in memory and not write to file system
const MemorySync = require("lowdb/adapters/Memory");

// create a lowdb database using the memory adapter
const db = low(new MemorySync());

// initialize the database with data from json file
db.defaults({ users: initUserCollection })
  .write();
// after any interaction that changes the database, use `write()` to commit changes

// store an id, this is for creating new users, and makes sure we don't assign same id twice
let uuid = initUserCollection.length + 1;

/*
 create a schema for the user post request using joi

 joi uses chained functions to build a validation objects
 e.g.
  - string() expects the value to be a string
  - min(3) expects the string to be at least 3 characters long
  - max(64) expects that the maximum is 64 characters
  - and required() makes the field required, without it user can ommit passing field
 for example, the city does not need to be included but country does
 the id field is not included here, because it needs to be genreated by the server
 */
const userPostRequestSchema = Joi.object({
  first_name: Joi.string().min(3).max(64).required(),
  last_name: Joi.string().min(3).max(64),
  city: Joi.string().min(1).max(64),
  country: Joi.string().min(1).max(64).required(),
});

// create and export plugin
module.exports = {
  // plugin requires a name
  name: "user-routes",
  // and a version
  version: "1.0.0",
  // and the register function
  register: async function(server, options) {

    /**
     * list users route
     */
    server.route({
      // define get method
      method: "GET",
      // and the url
      path: "/user",
      /*
       and define the handler
       the handler passes two objects, request and h
       - request is the server request object, it gives access to the the request and the server internals
       - h is the response toolkit, and it helps with modifying the response (like adding response code)
      */
      handler: (request, h) => {
        // get all users from users array
        const users =  db.get("users").value();
        // returning users array will be converted to a json array by hapi
        return users;
      }
    });

    /**
     * get single user by id
     */
    server.route({
      method: "GET",
      // define path with a required parameter - id
      path: "/user/{id}",
      handler: (request, h) => {
        // get id from request parameters
        const { id } = request.params;
        // find user in array, note that the id needs to be converted to a number, since that's how it's stored in the db
        const user = db.get("users").find({id:parseInt(id, 10)}).value();
        
        if (user !== undefined) {
          // uf user is define return
          return user
        }
        // if user is not found, return an error
        // I'm using the Boom library to generate the errot, this will add the 400 code.
        throw Boom.badRequest(`id ${id} not found`);
        /*
         because you may be matching another API you may need to customize the response.
         you can then use the h toolkit like this: `h.response({error:"BAD ID"}).code(400)`
         */
      }
    });

    /**
     * create user
     */
    server.route({
      method: "POST",
      path: "/user",
      config: {
        validate: {
        /**
         * payload validation
         * This will prevent sending an object that doesn't have the required parameters.
         * The error handler is defined globaly in server.js, you may find
         *   that you want to customize the response per-reoute
         *   in which case you can define it here under failAction
         */
          payload: userPostRequestSchema
        }
      },
      handler: (request, h) => {
        // get user from payload using object destructuring
        const { first_name, last_name, city, country } = request.payload;

        // generate an id using the uuid
        const id = uuid;
        
        // increment the uuid (for next user)
        uuid += 1;

        // create the user object
        const newUser = { id, first_name, last_name, city, country };

        // push user into the database and write changes
        db.get("users")
          .push(newUser)
          .write();

        // return a success message and the new id
        return { message: "user created", id };
      }
    });
  }
};
