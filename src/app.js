const port = process.env.PORT || 3000,
  sql = require("mssql"),
  http = require("http"),
  fs = require("fs"),
  html_disconnected = fs.readFileSync("index_disconnected.html"),
  html_connected = fs.readFileSync("index_connected.html");

const try_connect_sql = async (connectionString) => {
  try {
    console.log("trying to connect to server", connectionString);
    const connection = await sql.connect(connectionString);
    console.log("Connection to sql server was successful", connection);
    connection.close();
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
};

var server = http.createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, "OK", { "Content-Type": "text/html" });
    const result = await try_connect_sql(process.env.CONNECTION_STRING);
    res.write(result ? html_connected : html_disconnected);
  } else {
    res.writeHead(405, "Method Not Allowed", { "Content-Type": "text/plain" });
  }
  res.end();
});

// Listen on port 3000, IP defaults to 127.0.0.1
server.listen(port);

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:" + port + "/");