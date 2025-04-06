import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'; // We'll add basic trace exporting too
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  ConsoleLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Optional: Configure OpenTelemetry diagnostic logger
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// --- SDK Configuration ---

// Note: We configure the LoggerProvider here, but the SDK doesn't automatically
// integrate it like it does for traces and metrics. We still need to manage
// the LoggerProvider instance separately or ensure it's set globally if needed elsewhere.
// For simplicity, we'll keep the logger setup in logger.ts for now,
// but be aware NodeSDK primarily focuses on traces and metrics initialization.

const sdk = new NodeSDK({
  // Configure Trace Exporter
  traceExporter: new ConsoleSpanExporter(), // Uncomment to enable basic trace export to console

  // Configure Metric Exporter
  metricReader: new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(), // Commented out to reduce console noise
    exportIntervalMillis: 300000, // Adjust interval as needed
  }),

  // Enable Automatic Instrumentations (e.g., for http, express)
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    // Add other instrumentations here if needed, excluding V8
  ],

  // Note: sdk-logs integration with NodeSDK is less direct.
  // LoggerProvider needs separate setup (as we have in logger.ts).
});

// --- Start the SDK ---
sdk.start();
console.log('OpenTelemetry SDK started.'); // Simple confirmation

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK terminated.'))
    .catch((error) => console.error('Error terminating OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

// Export the initialized SDK instance if needed elsewhere (optional)
// export default sdk;
