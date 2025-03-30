export interface Config {
  enableTimingLogs: boolean;
  queriesFilePath: string;
}

export const config: Config = {
  enableTimingLogs: true,
  queriesFilePath: 'src/server/queries.json',
};
