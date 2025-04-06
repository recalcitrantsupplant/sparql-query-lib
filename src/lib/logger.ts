import { diag, DiagLogLevel, DiagConsoleLogger, metrics } from '@opentelemetry/api'; // Import metrics API
import { SeverityNumber } from '@opentelemetry/api-logs';
import { LoggerProvider, SimpleLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
// MeterProvider setup is now handled by NodeSDK in otel-setup.ts

// --- OpenTelemetry Logging Setup ---
// Note: @opentelemetry/sdk-logs is experimental (as of late 2024/early 2025)

// --- Get Meter Instance ---
// The MeterProvider is configured and set globally by NodeSDK in otel-setup.ts
export const meter = metrics.getMeter('sparql-query-lib', '1.0.0'); // Application name, version
// --- End Meter Instance ---

// --- Logging Setup ---
// Note: sdk-logs is still experimental and NodeSDK integration is limited.
// We keep the manual LoggerProvider setup here for now.
const loggerProvider = new LoggerProvider();

// Add a processor to export logs to the console
const exporter = new ConsoleLogRecordExporter();
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(exporter));

// Set the global logger provider (optional, but allows getting logger via logs.getLogger globally)
// Note: The @opentelemetry/api 'logs' object for direct logging is not the standard way for sdk-logs.
// Instead, we get a logger instance from the provider.
// logs.setGlobalLoggerProvider(loggerProvider); // This line might be unnecessary/incorrect with sdk-logs

// Get a logger instance for the application
// We export this instance for use in other modules.
export const logger = loggerProvider.getLogger('sparql-query-lib', '1.0.0'); // Application name, version

// Export SeverityNumber for use elsewhere
export { SeverityNumber };

// Optional: Graceful shutdown for logging
// NodeSDK in otel-setup.ts handles shutdown for metrics and traces.
process.on('SIGTERM', () => {
  loggerProvider.shutdown()
    .then(() => console.log('OTEL Logging terminated'))
    .catch((error) => console.error('Error terminating OTEL logging', error))
    // Let the SDK shutdown handle process exit
    // .finally(() => process.exit(0));
});
