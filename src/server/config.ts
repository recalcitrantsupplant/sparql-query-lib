export interface Config {
  enableTimingLogs: boolean;
  queriesFilePath: string;
  backendsFilePath: string; // Added path for backends JSON
}

export const config: Config = {
  enableTimingLogs: true, // Keep existing value or use process.env if preferred
  queriesFilePath: 'src/server/libraries.json', // Updated default path
  backendsFilePath: 'src/server/backends.json', // Added default path
};
