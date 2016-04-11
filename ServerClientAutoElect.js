
/*
  Filename: ServerClientAutoElect.js
  Name: Steven Johnston, Matthew Warren
  Date: 4/10/2016
  Description: A Node Js program that will look for local chat servers if not become one
                and allow for other to connect. Allows for server to shut down unexpectedly
                by reconnecting all connection to another unknown running client
*/

//This application requires both the net and dgram node js libraries for network connectvity

//net is used for TCP Connections
var net = require('net');
//dgram is used for UDP Connections
var dgram = require('dgram');

//This will be the address of this machine
var localAddress = "";

//boolean variables
var foundServer = false;
var isServer = false;

//Port for searching server to connect to
var broadCastPortSearch = 8081;
//Port for searching for other servers while being a server
var broadCastServerPort = 8082;

var TCPPort = 8083;

//Object for Listening to udp broadcast from unknown server
var BroadCastIn ={};

//Ip to broadCastOn - this will be local ip ending in 255
var broadCastIP = "";

//Object for a client to hold data for connect to server
var connectionToServer = {};

//Object for server data. Used if is the server
var server = {};

//Array of client connections - used by server
var clientConnections = [];

//The time the application was ran - used for 2 servers to decide who was first
var startTime = new Date().getTime();

//Gets the local address of this machine uses both dns and os libraries from node js
require('dns').lookup(require('os').hostname(), function (err, add, fam) {
  //set localaddress
  localAddress = add;
  //split ip address by the .
  var ipArray = localAddress.split('.');
  //change last part of ip to 255
  ipArray[3] = 255;
  //set the broadCastIP to the collapsed array
  broadCastIP = ipArray.join('.');
});

//Object for broadcasting local ip to unknow servers on local network
var BroadCastOut = {
  //Socket - a udp socket
  socket : dgram.createSocket("udp4"),
  //name: findServer
  //Description: broadcast udp packet with local ip on local network
  //Params : none
  //returns : undefined
  findServer : function(){
    //Message Object
    //  ip: local Ip
    //  type: "client": The type of this machine
    broadCastMessage = {ip:localAddress, type:"client"};

    //The message object in string form
    var broadCastMessageStr = JSON.stringify(broadCastMessage);
    //Send string message on socket
    this.socket.send(broadCastMessageStr, 0, broadCastMessageStr.length, this.port, broadCastIP);
    //Message indicating that you are looking for a server
    console.log("Sent: " + broadCastMessageStr + " on udp: " + this.port);
  },
  //the port to broadcast on
  port : broadCastPortSearch,

  //name: startBroadCast
  //description: Starts the broadcast that looks for servers
  //params: none
  //returns: undefined
  startBroadCast : function(){
    //Sets a interval for findServer() in this objectet
    this.broadCastLoop = setInterval(this.findServer.bind(this), 100);
    //Sets a time out that stops the search for server last 1 second
    this.broadCastTimeout = setTimeout(function(){
      //Ends broadcast
      this.endBroadCast();
    }.bind(this),1000);
  },

  //name: endBroadCast
  //description: Ends the broadcast for seaching for servers
  //params: none
  //returns: undefined
  endBroadCast : function(){
    //Stops the find server interval
    clearInterval(this.broadCastLoop);
    //If didnt find server at end of broadcast become a server
    if(!foundServer)
    {
      //Creates server
      server = becomeServer();
    }
  },
  //name: serverFound
  //desription: Called if server is found - stop additional server seach packets from being sent
  //params: none
  //returns: undefined
  serverFound : function()
  {
    //Stops additional packets for server search
    clearInterval(this.broadCastLoop);
    //prevents timeout from being called
    clearTimeout(this.broadCastTimeout);
    //Closes broadcast socket
    broadCastIn.closeSocket();
  },
};

//name: BroadCastInCon
//description: prototype for BroadCastIn Object. holds variables and functions for creating
//              and holding udp listening socket for listening to
//                    new clients as a server
//                    and new servers as a client
//params: none
//returns:
//  broadCastIn object
function BroadCastInCon()
{
  //Socket for listening on udp
  this.socket = dgram.createSocket('udp4');
  //Bind the port for finding servers as a client
  this.socket.bind(broadCastPortSearch);
  //Listen on socket
  this.socket.on('listening',function(){
    console.log("listening for broadcasted messages");
  });
  //When a message is recived on socket
  this.socket.on('message', function(message, remote)
  {
    //Create object from message
    var reciveBroadCast = JSON.parse(message.toString());
    //If message is from a client
    if(reciveBroadCast.type == 'client')
    {
      //If we are a server else ignore messages
      if(isServer)
      {
        console.log("UDP Message recived from client");
        //Stop broadcasting if we still are
        BroadCastOut.endBroadCast();
        //Message Object
        //  ip: local Ip
        //  type: "server": The type of this machine
        var message = {ip: localAddress, type:"server"};
        //The message object in string form
        var messageStr = JSON.stringify(message);

        console.log("Sending our IP to client over udp : " + reciveBroadCast.ip);
        //Send message over socket
        this.socket.send(messageStr, 0, messageStr.length, broadCastPortSearch, reciveBroadCast.ip);
      }
    }
    //If message is for a server
    else if(reciveBroadCast.type == 'server')
    {
      console.log("Recived broadcast from a server ip: " + reciveBroadCast.ip);
      //Connect to server
      connectionToServer = new ConnectToServer(reciveBroadCast.ip);
    }
  }.bind(this));
  //name: closeSocket
  //description: Closes this udp socket
  //params : none
  //returns : undefined
  this.closeSocket = function()
  {
    try {
      console.log("No Longer Listening for broadcast");
      this.socket.close();
    } catch (e) {

    } finally {

    }
  };
}
//name: becomeServer
//description: prototype for creating server object. used to become a server
//params: none
//returns:
//  server object
function becomeServer()
{
  //If not already a server
  if(!isServer)
  {
    console.log("Becoming server");
    //Create tcp socket
    this.socket = net.createServer(function(connection)
    {
      //Add new client to connection list
      clientConnections.push(connection);
      console.log('New Client Connected to TCP Server');

      //if client ends connection
      connection.on('end',function(){
        //remove client from list of connections
        clientConnections.splice(clientConnections.indexOf(connection), 1);
        console.log('Client Disconnected');
      });
      //when recived data
      connection.on('data',function(data)
      {
        //parse message into object
        var dataObj = JSON.parse(data);
        //Check message type
        switch (dataObj.type) {
          case "message": //Type is a text message
            console.log("Message from client: " + dataObj.data);
            //Send Message to all clients
            sendMessageToClients(dataObj.data.toString());
            break;
          case "became server": //Type is for a client to take over as server
            //Remove new server from client list
            clientConnections.splice(clientConnections.indexOf(connection), 1);
            //redirect clients to new server
            redirectOtherClients(dataObj.data.toString());
            //Destory TCP socket
            this.destroy();
            //Then close the program
            console.log("Program Closed");
            process.exit();
            break;
          default:
        }
      });
      //If connection has error
      connection.on('error', function(err)
      {
        console.log("Connection lost to client");
        //Remove client form list
        clientConnections.splice(clientConnections.indexOf(connection), 1);
      });
      //Pipes the connection
      connection.pipe(connection);
    }).listen(TCPPort);
    //Change boolean
    isServer = true;

    //Creates object for finding other servers
    this.findOtherServers = {};

    //Create udp socket for finding other servers
    this.findOtherServers.socket = dgram.createSocket('udp4'),
    //Binds find other server socket
    this.findOtherServers.socket.bind(broadCastServerPort),
    //Listen for other servers
    this.findOtherServers.socket.on('listening', function()
    {
      console.log("Listening for other servers");
    });
    //When recived message from other server
    this.findOtherServers.socket.on('message',function(message, remote)
    {
      //Create object from message
      var reciveBroadCast = JSON.parse(message.toString());
      //If message is from other server
      if(reciveBroadCast.ip != localAddress)
      {
        console.log("Found other server :" + reciveBroadCast.ip + ", Date Create : " + reciveBroadCast.dateCreated);
        //If this server is new then other server
        if(startTime < reciveBroadCast.dateCreated)
        {
          console.log("Swapping users to other server");
          //redirect all out client to other server
          redirectOtherClients(reciveBroadCast.ip);
          //no longer a server
          isServer = false;
          //Connect to other server
          connectionToServer = new ConnectToServer(reciveBroadCast.ip);
          //Close this servers broadcast socket that listens for other servers
          broadCastIn.closeSocket();
          //Stop broadcasting for looking for other servers
          clearInterval(this.broadCastLoop);
          //Close this servers TCP socket
          this.socket.close();
        }
      }
    }.bind(this.findOtherServers));
    //name: findServer
    //description: broadcast information about this server to other possible servers on network
    //params: none
    //return : undefined
    this.findOtherServers.findServer = function(){
      console.log("---> Looked for servers");
      //Message Object
      //  ip: local Ip
      //  type: "dateCreated": The start time of this application
      var message = {ip: localAddress, dateCreated: startTime};
      //The message object in string form
      var messageStr = JSON.stringify(message);
      //Send string message on socket (for other servers)
      this.findOtherServers.socket.send(messageStr, 0 , messageStr.length,broadCastServerPort,broadCastIP);
    };
    //name startBroadCast
    //description: sets interval for finding other servers over udp every 5 seconds
    //params: none
    //returns: undefined
    this.findOtherServers.startBroadCast = function()
    {
      //Sets interval on function that searches for other servers over udp
      this.broadCastLoop = setInterval(this.findServer.bind(this.findOtherServers),5000);
    };
    //Starts the broadcast for finding servers
    this.findOtherServers.startBroadCast();
  }
}

//name: ConnectToServer
//description: prototype function for creating connection to server
//params:
// ipAddress: the ipAddress of the server to connect to
//returns:
//  server connection object
function ConnectToServer(ipAddress)
{
  console.log('Connecting to server :' + ipAddress);
  //Create connections
  this.socket = net.connect({port:TCPPort,host:ipAddress},function(){
    console.log('Connected to server');
    //Stop broading for finding server
    BroadCastOut.serverFound();
  });
  //If connection has error
  this.socket.on("error",function (err)
  {
    console.log("Unexpected server loss");
    //Kill connection
    this.destroy();
    //Become a server
    server = becomeServer();
    //Start listening for new clients
    broadCastIn = new BroadCastInCon();
  });
  //when server closes connection
  this.socket.on("end", function()
  {
    console.log("Server Closed connection");
  });
  //When recived data form server TCP
  this.socket.on('data',function(data){
    try {
      //Parse message to data Object
      dataObj = JSON.parse(data.toString());
      //Check message type
      switch (dataObj.type) {
        case "message": //Message is a text message
          console.log("Recived Message : " + dataObj.data.toString());
          break;
        case "become server":
          //Message Object
          //  type: "became server"
          //  data: localAddress: Send our ip to the server
          var message = {type:"became server", data: localAddress};
          //the message object in string form
          var messageStr = JSON.stringify(message);
          //Send message to server
          this.write(messageStr);
          //Become a server
          server = becomeServer();
          //Start listening for clients
          broadCastIn = new BroadCastInCon();
          break;
        case "change server": //Message is to change servers
          //Destory connection to current server
          this.destroy();
          //Connect to new server
          connectionToServer = new ConnectToServer(dataObj.data);
          break;
        default:
      }
    } catch (e) {

    } finally {

    }
  });
  //When Server closes connection
  this.socket.on('end',function(){
    console.log('Lost connection to server');
  });
  //name: sendMaessge
  //description: sends message over this socket
  //params:
  //  data: The data to send over the socket
  //Returns: undefined
  this.sendMessage = function (data)
  {
    this.socket.write(data);
  };
  //name: closeConnection
  //description: Clost the connection and the program
  //params: none
  //Returns: undefined
  this.closeConnection = function()
  {
    //Destory the tcp connection
    this.socket.destroy();
    //Then close the program
    console.log("Program Closed");
    process.exit();
  }
}

//start finding servers
BroadCastOut.startBroadCast();
//Starting listening for server responces
broadCastIn = new BroadCastInCon();

//readline library for reading of the console
const readline = require('readline');
//Set the input and out put to stdin and stdout
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
//name: getCommand
//description: Reads line from console
//params: none
//returns : undefined
function getCommand()
{
  //Ask user to enter command
  rl.question('', function (data) {
    //If is a server
    if(isServer)
    {
      //Check string typed
      switch (data) {
        case "close"://Close server
          //redirect clients
          redirectClients();
          break;
        case "--help"://User asked for help
          console.log("--> type [close] to stop server \n-->or a message to send to all clients");
          break;
        default:
          //Send Message to all clients
          sendMessageToClients(data);
      }
    }
    // is a client
    else
    {
      //Chech string typed
      switch (data) {
        case "--help"://user asked for help
          console.log("--> Type [close] to disconnect from server \n-->or a message to send to server");
          break;
        case "close":
          //close connection to server
          connectionToServer.closeConnection();
          break;
        default:
        var message = {type:"message", data: data};
        var messageStr = JSON.stringify(message);
        console.log("Sending message to server :" + data);
        connectionToServer.sendMessage(messageStr);
      }
    }
    //Get next command
    getCommand();
  });
}
//Get next command
getCommand();

//name: sendMessageToClients
//description: sends message to all connected clientSocket
//params:
//  data: Data to send to each client
//returns: undefined
function sendMessageToClients(data)
{
  //Message Object
  //  type: "message"
  //  data: data: core of message
  var message = {type:"message",data:data};
  //the message object in string form
  messageStr = JSON.stringify(message);
  console.log("Sent Message to clients : " + data);
  //loop each connection
  clientConnections.forEach(function (clientSocket)
  {
    //Send messsage over socket
    clientSocket.write(messageStr);
  });
}
//name: redirectClients
//description: Contacts first client to become a server
//params: none
//returns: undefined
function redirectClients()
{
  //Message Object
  //  type: "become server"
  //  data: "undefined" : not required
  var message = {type:"become server",data:"undefined"};
  //the message object in string form
  messageStr = JSON.stringify(message);
  //Send Message to first client only
  clientConnections[0].write(messageStr);
}
//name: redirectOtherClients
//description: Messages all clients new server ip address
function redirectOtherClients(ip)
{
  //Message Object
  //  type: "change server"
  //  data: ip: Sends ip of new server
  var message = {type: "change server", data:ip};
  //the message object in string form
  var messageStr = JSON.stringify(message);
  console.log("Redirecting clients to :" + ip);
  //loop through each client connection
  clientConnections.forEach(function (clientSocket)
  {
    //Sends message to client
    clientSocket.write(messageStr);
  });
}
