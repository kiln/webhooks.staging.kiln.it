#!/usr/bin/nodejs

/*
 *  A simple GitHub webhook to deploy our apps to staging when they’re updated.
 */

const DIRECTORY = "/home/ubuntu",
      PORT = 9001;

var fs = require("fs"),
    http = require("http"),
    child_process = require("child_process"),
    path = require("path"),
    querystring = require("querystring"),
    url = require("url");

process.chdir(DIRECTORY);

http.createServer(function (request, response) {
    if (request.method != "POST") {
        console.log("Rejecting %s request", request.method);
        response.writeHead(405, "Method Not Allowed");
        response.end();
        return;
    }

    var request_url = url.parse(request.url),
        path_components = request_url.pathname.split("/"),
        project_name = path_components[1];

    if (!project_name.match(/^[A-Za-z0-9][0-9.A-Za-z_-]+$/) || !fs.existsSync(project_name)) {
        console.log("Rejecting request for '%s'", project_name);
        response.writeHead(404, "Not Found");
        response.end();
        return;
    }

    function runCommand(command, args, success_callback) {
        child_process.spawn(command, args, { stdio: "inherit", cwd: project_name })
            .on("close", function(status) {
                if (status == 0) {
                    success_callback();
                }
                else {
                    console.log("A command returned an error: " + command);
                    response.writeHead(500, "Internal Server Error");
                    response.end();
                }
            });
    }

    function pullBranch(branch) {
        var data = "";
        request.on("data", function(chunk) { data += chunk; })
               .on("end", function() {

            var details = JSON.parse(querystring.parse(data).payload);
            if (details.ref == "refs/heads/" + branch) {
                console.log("Changes pushed to %s by %s <%s>", project_name, details.pusher.name, details.pusher.email);

                runCommand("/usr/bin/git", ["fetch"], function() {
                    runCommand("/usr/bin/git", ["reset", "--hard", "FETCH_HEAD"], function() {
                        fs.exists(path.join(project_name, "bin", "post-update"), function(exists) {
                            if (exists) {
                                response.writeHead(200, {"Content-Type": "text/plain; charset=utf-8"});
                                response.write("Done!");
                                response.end();
                                runCommand("bin/post-update", []);
                            } else {
                                response.writeHead(200, {"Content-Type": "text/plain; charset=utf-8"});
                                response.write("Done!");
                                response.end();
                            }
                        });
                    });
                });
            }
            else if (!details.ref) {
                console.log("%s: 'ref' not specified", project_name);
                console.log(JSON.stringify(details));
                response.writeHead(500, {"Content-Type": "text/plain; charset=utf-8"});
                response.write("Ignoring push with unspecified 'ref'");
                response.end();
            }
            else {
                console.log("%s: Ignoring push to %s", project_name, details.ref);
                response.writeHead(200, {"Content-Type": "text/plain; charset=utf-8"});
                response.write("Ignoring push to " + details.ref);
                response.end();
            }
        });
    }

    child_process.execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: project_name }, function(error, stdout, stderr) {
        if (error) {
            console.log(stderr);
            console.log("Failed to get branch for " + project_name);
            response.writeHead(500, "Internal Server Error");
            response.end();
            return;
        }

        const branch = stdout.trim();
        try {
            pullBranch(branch);
        }
        catch (e) {
            console.error("Internal error", e.stack);
            response.writeHead(500, "Internal Server Error");
            response.end();
        }
    });

}).listen(PORT);
