export default class WebsocketConnector {

    connection;

    getConnection(url) {

        if (!this.connection) {
            this.connection = new WebSocket(url);


        }

        return this.connection;
    }
}