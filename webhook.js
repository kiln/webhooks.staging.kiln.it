/*
 *  A simple GitHub webhook to deploy our apps to staging when they’re updated.
 */

const DIRECTORY = "/home/robin/Kiln",
      BRANCH = "master",
      PORT = 9001;

var fs = require("fs"),
    http = require("http"),
    child_process = require("child_process"),
    querystring = require("querystring"),
    url = require("url");

http.createServer(function (request, response) {
    if (request.method != "POST") {
        console.log("Rejecting %s request", request.method);
        response.writeHead(405, "Method Not Allowed");
        response.end();
        return;
    }
    
    process.chdir(DIRECTORY);
    
    var request_url = url.parse(request.url),
        path_components = request_url.pathname.split("/"),
        project_name = path_components[1];
    
    if (!project_name.match(/^[A-Za-z_-]+$/) || !fs.existsSync(project_name)) {
        console.log("Rejecting request for '%s'", project_name);
        response.writeHead(404, "Not Found");
        response.end();
        return;
    }
    
    try {
        process.chdir(project_name);
    }
    catch (e) {
        console.log("Cannot chdir to '%s'", project_name);
        response.writeHead(500, "Internal Server Error");
        response.end();
        return;
    }
    
    function runCommand(command, args, success_callback) {
        child_process.spawn(command, args, {stdio: "inherit"})
            .on("close", function(status) {
                if (status == 0) {
                    success_callback();
                }
                else {
                    console.log("Git returned an error");
                    response.writeHead(500, "Internal Server Error");
                    response.end();
                }
            });
    }
    
    try {
        var data = "";
        request.on("data", function(chunk) { data += chunk; })
               .on("end", function() {
            
            var details = JSON.parse(querystring.parse(data).payload);
            if (details.ref == "refs/heads/" + BRANCH) {
                console.log("Changes pushed by %s <%s>", details.pusher.name, details.pusher.email);
                
                runCommand("/usr/bin/git", ["pull"], function() {
                    // runCommand("/usr/bin/grunt", ["build"], function() {
                        response.writeHead(200, {"Content-Type": "text/plain; charset=utf-8"});
                        response.write("Done!");
                        response.end();
                    // });
                });
            }
            else {
                console.log("Ignoring push to %s", details.ref);
            }
        });
    }
    catch (e) {
        console.log("Internal error", e.stack);
        response.writeHead(500, "Internal Server Error");
        response.end();
    }
}).listen(PORT);
