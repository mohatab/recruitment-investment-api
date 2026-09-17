// Real Socket.IO integration test: spins up an actual HTTP + Socket.IO
// server on an ephemeral port and connects with the real socket.io-client,
// because the vulnerability class this guards against (a client joining
// another user's room) only exists at the transport/handshake level —
// a unit test calling initSocket's internals directly wouldn't prove
// anything about what a real client can or can't do.
const http = require("http");
const { Server } = require("socket.io");
const { io: ioClient } = require("socket.io-client");
const { app, registerUser } = require("../helpers");
const { initSocket } = require("../../src/realtime/socket");

let server;
let port;

beforeAll((done) => {
  server = http.createServer(app);
  const io = new Server(server);
  initSocket(io);
  server.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

function connectWithToken(token) {
  return ioClient(`http://localhost:${port}`, {
    auth: token ? { token } : {},
    transports: ["websocket"],
    forceNew: true,
  });
}

describe("Socket.IO authentication and authorization", () => {
  test("connecting without a token is rejected", (done) => {
    const client = connectWithToken(null);
    client.on("connect_error", (err) => {
      expect(err.message).toMatch(/token/i);
      client.close();
      done();
    });
    client.on("connect", () => {
      client.close();
      done(new Error("should not have connected without a token"));
    });
  });

  test("connecting with a garbage token is rejected", (done) => {
    const client = connectWithToken("not-a-real-jwt");
    client.on("connect_error", () => {
      client.close();
      done();
    });
    client.on("connect", () => {
      client.close();
      done(new Error("should not have connected with an invalid token"));
    });
  });

  test("a valid token connects, and messages only reach the intended recipient — not an unrelated third party", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const eve = await registerUser();

    const aliceSocket = connectWithToken(alice.accessToken);
    const bobSocket = connectWithToken(bob.accessToken);
    const eveSocket = connectWithToken(eve.accessToken);

    await Promise.all(
      [aliceSocket, bobSocket, eveSocket].map(
        (s) => new Promise((resolve, reject) => s.on("connect", resolve).on("connect_error", reject))
      )
    );

    // Both recipients listen; only Bob should ever see this message.
    const bobReceived = new Promise((resolve) => bobSocket.on("message", resolve));
    const eveReceivedAnything = new Promise((resolve) => {
      eveSocket.on("message", () => resolve("eve got a message"));
      setTimeout(() => resolve("nothing"), 300);
    });

    aliceSocket.emit("chat:message", { receiverId: bob.user._id, body: "hi bob" });

    const received = await bobReceived;
    expect(received.body).toBe("hi bob");
    expect(await eveReceivedAnything).toBe("nothing");

    aliceSocket.close();
    bobSocket.close();
    eveSocket.close();
  });
});
