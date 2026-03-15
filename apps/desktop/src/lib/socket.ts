export type WsMessage = {
    type: string;
    payload: any;
};

export class TrustlineSocket {
    private ws: WebSocket | null = null;
    private handlers: ((msg: WsMessage) => void)[] = [];
    private currentToken: string = "";

    constructor(private baseUrl: string) {}

    connect(token: string = "") {
        if (token) this.currentToken = token;
        const url = this.currentToken ? `${this.baseUrl}?token=${this.currentToken}` : this.baseUrl;
        
        this.ws = new WebSocket(url);
        this.ws.onmessage = (event) => {
            const msg: WsMessage = JSON.parse(event.data);
            this.handlers.forEach(h => h(msg));
        };
        this.ws.onclose = () => {
            console.log("Disconnected. Reconnecting...");
            setTimeout(() => this.connect(this.currentToken), 3000);
        };
    }

    send(type: string, payload: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }

    onMessage(handler: (msg: WsMessage) => void) {
        this.handlers.push(handler);
    }
}

export const socket = new TrustlineSocket("ws://localhost:3000/ws");
