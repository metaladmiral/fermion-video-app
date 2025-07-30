import { ChildProcess } from "child_process";
import * as mediasoup from "mediasoup";

export type Producer = Map<string, Map<string, mediasoup.types.Producer>>;
export type Consumer = Map<string, Map<string, mediasoup.types.Consumer>>;
export type rtpConsumerForFfmpeg = Map<string, mediasoup.types.Consumer>;

export interface ChildProcessController {
  process: ChildProcess;
  cleanup: (process: ChildProcess, gracePeriodMs?: number) => Promise<void>;
  isRunning: boolean;
}
