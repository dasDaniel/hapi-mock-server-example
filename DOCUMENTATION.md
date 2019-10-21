# RestAPI Mocking server with hapi.js

## Purpose 

Most of the work I do these days is creating user interfaces for admin backends. This usually entails building Single Page Applications (SPA) using front-end JavaScript frameworks like Vue or React, and to build an SPA, you need to have an API to power the application. Sometimes you may be able to work with a working API server, but usually you want to have a server that mocks the actual server.

Using a mocking server allows you to set the application in a predictable state, which makes development and testing easier.

## Mocking server functionality

Depending on your application, your needs will vary.

The simplest form of mocking server can be done with little more than a file server. The expected responses can be stored in json files, and the server just sends the various files as api endpoints. This is fast to set-up, but is not very flexible. It only supports `GET` requests, so you wouldn't be able to do any other Rest API calls (like `POST`).

You could add some additional route handlers for `POST` or `DELETE` requests, but the benefit/issue is that because data is immutable. So these requests will not affect subsequent requests. That means that if you have a list of users and you delete one, upon a seemingly successful delete, that user will remain there. This can be acceptable, even desired, functionality, but the mocking server I'm going to build here is going to maintain state between restarts. Every time you start the server it will start from the same state, but interacting with the server will mutate the state. So deleting an existing user will remove them from db until you restart the mocking server.

## About hapi (hapi.js)

hapi, like express, is a Node.js server. Unlike express, though, it is much more opinionated and (IMHO) suitable for large projects. It has more out-of-the-box functionality and more focus on security. That said, express would make a fine choice for a API mocking service, but I chose hapi.

## getting started

### Initialize project

`npm init`
  
### install dependencies

`npm i -s @hapi/hapi @hapi/joi lowdb`
- hapi is the server
- joi is a validation library
- lowdb is a local JSON database based on the lodash library

### add script to _package.json_

`"serve":"node server.js"`

running `npm run serve` will start the server (once the server.js file is created)


### create database file `db/users.json` with some mock data
  ```json
  [
    {"id": 1, "first_name": "Guillaume", "last_name": "Potapczuk", "city": "Dopang", "country": "Indonesia"},
    {"id": 2, "first_name": "Torre", "last_name": "Burnell", "city": "Shiqiao", "country": "China"},
    {"id": 3, "first_name": "Donalt", "last_name": "Giannoni", "city": "General Elizardo Aquino", "country": "Paraguay"},
    {"id": 4, "first_name": "Jade", "last_name": "Warsap", "city": "Fuhe", "country": "China"},
    {"id": 5, "first_name": "Violet", "last_name": "Hinzer", "city": "Bondo", "country": "Democratic Republic of the Congo"},
    {"id": 6, "first_name": "Eleanore", "last_name": "Leiden", "city": "El Porvenir", "country": "Honduras"},
    {"id": 7, "first_name": "Andris", "last_name": "Bysouth", "city": "Moss", "country": "Norway"},
    {"id": 8, "first_name": "Hilary", "last_name": "Speenden", "city": "Rāmhormoz", "country": "Iran"},
    {"id": 9, "first_name": "Albertine", "last_name": "Courage", "city": "Devon", "country": "Canada"},
    {"id": 10, "first_name": "Aubert", "last_name": "Favill", "city": "Murfreesboro", "country": "United States"},
    {"id": 11, "first_name": "Rik", "last_name": "Rushforth", "city": "Sidokumpul", "country": "Indonesia"},
    {"id": 12, "first_name": "Nataline", "last_name": "Pickvance", "city": "Araxá", "country": "Brazil"},
    {"id": 13, "first_name": "Irina", "last_name": "Trounce", "city": "Kardzhin", "country": "Russia"},
    {"id": 14, "first_name": "Bowie", "last_name": "Ranklin", "city": "Jinhe", "country": "China"}
  ]
  ```
  
### create `server.js` file

```js
const Hapi = require("@hapi/hapi");

// get routes plugin
const userRoutes = require("./routes/users");

// get host from environment variable, or default to "localhost"
const HOST = process.env.HOST || 'localhost';

// get port from environment variable, or default to 7000
const PORT = process.env.PORT || 7000;

// create async function, this allows using await
(async () => {
  // create a new hapi server
  const server = Hapi.server({
    host: HOST,
    port: PORT,
    // define route defaults
    routes: {
      validate: {
        // assigning a failAction function here will make this
        //   the default handler for validation failures. That
        //   means anytime a user submits data that doesn't pass
        //   validaiton, this functions handles it.
        // If this function is not defined anywhere, the message
        //   to the user will be generic and not very useful.
        failAction: async (request, h, err) => {
          // wrap message using Boom library
          // in this case, it will send a bad request response 
          //   with a 400 code and the error message will
          //   include information about parameter that didn't
          //   pass validation
          throw Boom.badRequest(err.message);
        }
      }
    }
  });

  // difinition of the base route
  server.route({
    method: "GET",
    path: "/",
    handler: (request, h) => {
      // respond with a json object
      return h.response({ message: "Hello World" });
      // you can also just return an object, hapi will handle
      //   it the same way
    }
  });

  // register the user routes plugin
  // this needs to finish before server.start(), that's why it
  //   uses await. You can also use a promise.
  await server.register(userRoutes);

  // start the server
  server.start();

  // display information to console about what host/port the
  //   server is running on
  console.info(`Server started at ${server.info.uri}`);
})();
```

### create `routes/users.js` file

This file will create a hapi plugin, that registers the user routes to the server. 

```js
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
```

### run your server

```sh
npm run serve
```

## Adding more routes

To add additional routes, you can keep creating additional route plugins and registering them with the server. I would recommend to have each url in separate file, as it makes it easier to find handlers.

One problem you may find is that in some cases you may want to show multi-model relationships. Because the database is specific to the route, updating users would not be possible from any other plugin because each plugin would have their own instance of the database even if they're sharing the same file to generate the initial state. There are ways of handling it by sharing the database instance between the plugins. I lean toward thinking that that's coming too close to building a server, rather than mocking one. However, that depends on the need and should be decided on a case-by-case basis; also some may find that this server is already going bit past what a mocking server should do.

## Customizing responses

The responses in this case are using the hapi conventions, which I believe are a pretty good convention to use. In some cases you may be mocking an existing server or a server that is going to have different requirements. In that case you can modify your responses by removing use of Boom and/or Joi, and handle the route validation and response yourself.

For example, Instead of using 

```js
return Boom.badRequest("invalid query");
```

you can use the hapi toolkit object (`h`) provided to the handler

```js
return h.response({statusCode:400, error: "Bad Request", "message": "invalid query"}).code(400);
```
these two commands have the same result, but the former (Boom) is easier to implement, while later gives you more control.

## Other possibilities

As your application grows, you may find yourself wanting to have different initial states. This is _especially_ useful for automated testing.

You can handle this by versioning the database folder. Instead of listing the route initial states there, you can put the different version into sub-folders.

For example, you can have the users.json file under `db\default\users.json`, and an empty users array in `db\initial\users.json`.

You can then update the line calling the json db file to...

```js
// to define using environment variables
const INSTANCE = process.env.INSTANCE || 'default';

// OR using command line argument
// const INSTANCE = process.argv[2] || 'default';

// and call the database using the folder name as the instance
const initUserCollection = require(`../db/${INSTANCE}/users.json`);
```

Then you can call the script setting the environment variable. (or by passing the command line argument, if you're using `argv`)


