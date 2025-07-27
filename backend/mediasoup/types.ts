import * as mediasoup from "mediasoup";

export type Producer = Map<string, Map<string, mediasoup.types.Producer>>;
export type Consumer = Map<string, Map<string, mediasoup.types.Consumer>>;
