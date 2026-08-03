/**
 * XFlow SDK - Logging Example
 * 
 * This example demonstrates the complete logging capabilities of the XFlow SDK.
 * It shows:
 * 1. Automatic API logging
 * 2. Manual logging with different levels
 * 3. Custom workflow tracking
 * 4. Error handling with logging
 */

import { PowerFlowApp, SDK_EVENTS } from '../index.js';

// ==================== Example 1: Basic Logging ====================

export async function basicLoggingExample() {
  console.log('\n=== Example 1: Basic Logging ===\n');
  
  // Initialize SDK (this will automatically log initialization)
  await PowerFlowApp.initialize({
    userId: 'example_user',
    apiBaseURL: 'http://localhost:8080',
    logLevel: 'INFO'
  });
  
  // Manual logging with different levels
  PowerFlowApp.log('This is an info message', 'info');
  PowerFlowApp.log('This is a success message', 'success');
  PowerFlowApp.log('This is a warning message', 'warning');
  PowerFlowApp.log('This is an error message', 'error');
}

// ==================== Example 2: Workflow Logging ====================

export async function workflowLoggingExample(file) {
  console.log('\n=== Example 2: Workflow with Logging ===\n');
  
  try {
    // Log start of workflow
    PowerFlowApp.log(`🚀 Starting analysis workflow for ${file.name}`, 'info');
    
    // Step 1: Upload file
    PowerFlowApp.log('📤 Step 1/3: Uploading file to server...', 'info');
    const uploadResult = await PowerFlowApp.uploadUserFile(file);
    // API request will be automatically logged
    PowerFlowApp.log(`✓ File uploaded: ${uploadResult.file_name}`, 'success');
    
    // Step 2: Create session
    PowerFlowApp.log('🔧 Step 2/3: Creating analysis session...', 'info');
    const sessionResult = await PowerFlowApp.createSessionFromFile(file.name);
    // API request will be automatically logged
    PowerFlowApp.log(`✓ Session created: ${sessionResult.session_id}`, 'success');
    
    // Step 3: Run calculation
    PowerFlowApp.log('⚡ Step 3/3: Running power flow calculation...', 'info');
    const calcResult = await PowerFlowApp.calculate('dc', {
      tolerance: 1e-3,
      maxIterations: 100
    });
    // API request will be automatically logged
    
    // Log results
    const converged = calcResult.results?.converged;
    const iterations = calcResult.results?.iterations || 0;
    
    if (converged) {
      PowerFlowApp.log(
        `✓ Analysis completed successfully! Converged in ${iterations} iterations`,
        'success'
      );
    } else {
      PowerFlowApp.log(
        `⚠ Analysis completed but did not converge after ${iterations} iterations`,
        'warning'
      );
    }
    
    PowerFlowApp.log('🎉 Workflow completed successfully!', 'success');
    
    return calcResult;
    
  } catch (error) {
    PowerFlowApp.log(`❌ Workflow failed: ${error.message}`, 'error');
    throw error;
  }
}

// ==================== Example 3: Error Handling ====================

export async function errorHandlingExample() {
  console.log('\n=== Example 3: Error Handling with Logging ===\n');
  
  try {
    PowerFlowApp.log('Attempting to run calculation without session...', 'info');
    await PowerFlowApp.calculate('dc');
    
  } catch (error) {
    // Log the error
    PowerFlowApp.log(`Error caught: ${error.message}`, 'error');
    
    // Log recovery attempt
    PowerFlowApp.log('Attempting to recover...', 'warning');
    
    // Try to check connection
    const health = await PowerFlowApp.checkHealth();
    if (health.status === 'ok') {
      PowerFlowApp.log('Backend connection OK', 'success');
    } else {
      PowerFlowApp.log('Backend connection issues detected', 'error');
    }
  }
}

// ==================== Example 4: Listening to Logs ====================

export function loggingListenerExample() {
  console.log('\n=== Example 4: Listening to Log Events ===\n');
  
  // Subscribe to log events
  const unsubscribe = PowerFlowApp.on(SDK_EVENTS.LOG, (logEntry) => {
    console.log(`[${logEntry.timestamp}] [${logEntry.level.toUpperCase()}] ${logEntry.message}`);
  });
  
  // Emit some logs
  PowerFlowApp.log('First log message', 'info');
  PowerFlowApp.log('Second log message', 'success');
  PowerFlowApp.log('Third log message', 'warning');
  
  // Unsubscribe when done
  setTimeout(() => {
    unsubscribe();
    console.log('Unsubscribed from log events');
  }, 1000);
}

// ==================== Example 5: Custom Log Processor ====================

export function customLogProcessorExample() {
  console.log('\n=== Example 5: Custom Log Processor ===\n');
  
  // Create a custom log processor that filters by level
  const logBuffer = {
    info: [],
    success: [],
    warning: [],
    error: []
  };
  
  const unsubscribe = PowerFlowApp.on(SDK_EVENTS.LOG, (logEntry) => {
    // Store logs by level
    if (logBuffer[logEntry.level]) {
      logBuffer[logEntry.level].push(logEntry);
    }
    
    // Only show warnings and errors in console
    if (logEntry.level === 'warning' || logEntry.level === 'error') {
      console.log(`⚠️ [${logEntry.level}] ${logEntry.message}`);
    }
  });
  
  // Generate various logs
  PowerFlowApp.log('Normal operation', 'info');
  PowerFlowApp.log('Task completed', 'success');
  PowerFlowApp.log('Memory usage high', 'warning');
  PowerFlowApp.log('Connection lost', 'error');
  
  // Print summary
  console.log('\nLog Summary:');
  console.log(`Info: ${logBuffer.info.length}`);
  console.log(`Success: ${logBuffer.success.length}`);
  console.log(`Warning: ${logBuffer.warning.length}`);
  console.log(`Error: ${logBuffer.error.length}`);
  
  // Cleanup
  unsubscribe();
}

// ==================== Example 6: Performance Logging ====================

export async function performanceLoggingExample(file) {
  console.log('\n=== Example 6: Performance Logging ===\n');
  
  const startTime = Date.now();
  
  try {
    PowerFlowApp.log('⏱ Performance test started', 'info');
    
    // Upload
    const uploadStart = Date.now();
    await PowerFlowApp.uploadUserFile(file);
    const uploadTime = Date.now() - uploadStart;
    PowerFlowApp.log(`📊 Upload took ${uploadTime}ms`, 'info');
    
    // Create session
    const sessionStart = Date.now();
    await PowerFlowApp.createSessionFromFile(file.name);
    const sessionTime = Date.now() - sessionStart;
    PowerFlowApp.log(`📊 Session creation took ${sessionTime}ms`, 'info');
    
    // Calculate
    const calcStart = Date.now();
    await PowerFlowApp.calculate('dc');
    const calcTime = Date.now() - calcStart;
    PowerFlowApp.log(`📊 Calculation took ${calcTime}ms`, 'info');
    
    // Total time
    const totalTime = Date.now() - startTime;
    PowerFlowApp.log(`📊 Total workflow time: ${totalTime}ms`, 'success');
    
    // Log breakdown
    PowerFlowApp.log(
      `📈 Breakdown: Upload ${Math.round(uploadTime/totalTime*100)}%, ` +
      `Session ${Math.round(sessionTime/totalTime*100)}%, ` +
      `Calc ${Math.round(calcTime/totalTime*100)}%`,
      'info'
    );
    
  } catch (error) {
    PowerFlowApp.log(`⏱ Performance test failed after ${Date.now() - startTime}ms`, 'error');
    throw error;
  }
}

// ==================== Example 7: Batch Operations ====================

export async function batchLoggingExample(files) {
  console.log('\n=== Example 7: Batch Operations with Logging ===\n');
  
  PowerFlowApp.log(`📦 Starting batch processing of ${files.length} files`, 'info');
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    PowerFlowApp.log(`[${i+1}/${files.length}] Processing ${file.name}...`, 'info');
    
    try {
      // Upload and calculate
      await PowerFlowApp.uploadUserFile(file);
      await PowerFlowApp.createSessionFromFile(file.name);
      const result = await PowerFlowApp.calculate('dc');
      
      results.push({ file: file.name, success: true, result });
      successCount++;
      PowerFlowApp.log(`✓ [${i+1}/${files.length}] ${file.name} completed`, 'success');
      
    } catch (error) {
      results.push({ file: file.name, success: false, error: error.message });
      errorCount++;
      PowerFlowApp.log(`✗ [${i+1}/${files.length}] ${file.name} failed: ${error.message}`, 'error');
    }
  }
  
  // Summary
  PowerFlowApp.log(
    `📊 Batch complete: ${successCount} succeeded, ${errorCount} failed`,
    errorCount === 0 ? 'success' : 'warning'
  );
  
  return results;
}

// ==================== Run All Examples ====================

export async function runAllExamples() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   XFlow SDK - Logging Examples                   ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  
  try {
    // Example 1: Basic logging
    await basicLoggingExample();
    
    // Example 4: Event listeners
    loggingListenerExample();
    
    // Example 5: Custom log processor
    customLogProcessorExample();
    
    console.log('\n✅ All examples completed!\n');
    
    // Note: Examples 2, 3, 6, 7 require actual files and are meant to be used
    // in a real application context
    
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Export for use in browser/React
export default {
  basicLoggingExample,
  workflowLoggingExample,
  errorHandlingExample,
  loggingListenerExample,
  customLogProcessorExample,
  performanceLoggingExample,
  batchLoggingExample,
  runAllExamples
};

