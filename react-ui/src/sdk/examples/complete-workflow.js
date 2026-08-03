/**
 * Complete Workflow Example
 * 
 * This example demonstrates the complete workflow of using the XFlow SDK:
 * 1. Initialize
 * 2. Create session
 * 3. Upload file
 * 4. Get network data
 * 5. Edit network
 * 6. Calculate
 * 7. Save file
 */

import { PowerFlowApp, ANALYSIS_METHODS, ELEMENT_TYPES, SDK_EVENTS } from '../index.js';

async function completeWorkflow(file) {
  try {
    console.log('=== XFlow SDK Complete Workflow ===\n');

    // Step 1: Initialize SDK
    console.log('1. Initializing SDK...');
    await PowerFlowApp.initialize({
      userId: 'demo_user',
      apiBaseURL: 'http://localhost:8080',
      logLevel: 'INFO',
      persistSession: false
    });
    console.log('✅ SDK initialized\n');

    // Step 2: Set up event listeners
    console.log('2. Setting up event listeners...');
    PowerFlowApp.on(SDK_EVENTS.UPLOAD_COMPLETE, (data) => {
      console.log(`   📤 Upload complete: ${data.fileName}`);
    });

    PowerFlowApp.on(SDK_EVENTS.EDIT_COMPLETE, (data) => {
      console.log(`   ✏️  Edit complete: ${data.elementType} ${data.action}`);
    });

    PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
      console.log(`   🔢 Calculation complete: ${data.results.converged ? 'Converged' : 'Failed'}`);
    });
    console.log('✅ Event listeners set up\n');

    // Step 3: Create session
    console.log('3. Creating session...');
    const sessionId = await PowerFlowApp.createSession();
    console.log(`✅ Session created: ${sessionId}\n`);

    // Step 4: Upload file
    console.log('4. Uploading file...');
    const uploadResult = await PowerFlowApp.uploadFile(file, sessionId);
    console.log(`✅ File uploaded: ${uploadResult.file_path}\n`);

    // Wait a bit for temp file creation
    console.log('   Waiting for temp file creation...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Get network data
    console.log('5. Getting network data...');
    const network = await PowerFlowApp.getNetwork();
    console.log(`✅ Network data retrieved:`);
    console.log(`   - Buses: ${network.network_data.bus?.length || 0}`);
    console.log(`   - Loads: ${network.network_data.load?.length || 0}`);
    console.log(`   - Generators: ${network.network_data.generator?.length || 0}`);
    console.log(`   - AC Lines: ${network.network_data.acline?.length || 0}`);
    console.log(`   - Transformers: ${network.network_data.transformer?.length || 0}\n`);

    // Step 6: Edit network (add a bus)
    console.log('6. Editing network (adding a bus)...');
    const editResult = await PowerFlowApp.addElement(ELEMENT_TYPES.BUS, {
      ibus: 99999,
      name: 'SDK_TEST_BUS',
      baskv: 230.0,
      ide: 1,
      vm: 1.0,
      va: 0.0
    });
    console.log(`✅ Bus added successfully\n`);

    // Step 7: Verify the edit
    console.log('7. Verifying the edit...');
    const updatedNetwork = await PowerFlowApp.getNetwork();
    const newBus = updatedNetwork.network_data.bus.find(b => b.ibus === 99999);
    if (newBus) {
      console.log(`✅ Bus verified: ${newBus.name} (${newBus.ibus})\n`);
    } else {
      console.log('⚠️  Warning: Bus not found in network\n');
    }

    // Step 8: Run power flow calculation
    console.log('8. Running DC power flow calculation...');
    const calcResult = await PowerFlowApp.calculate(ANALYSIS_METHODS.DC, {
      tolerance: 1e-3,
      maxIterations: 100
    });
    
    console.log(`✅ Calculation complete:`);
    console.log(`   - Converged: ${calcResult.results.converged}`);
    console.log(`   - Iterations: ${calcResult.results.iterations}`);
    console.log(`   - Time: ${calcResult.results.solution_time_ms}ms`);
    console.log(`   - Bus results: ${calcResult.results.bus_results?.length || 0}`);
    console.log(`   - AC line results: ${calcResult.results.acline_results?.length || 0}`);
    console.log(`   - Transformer results: ${calcResult.results.transformer_results?.length || 0}\n`);

    // Step 9: Save the file
    console.log('9. Saving file...');
    const saveResult = await PowerFlowApp.saveFile({
      action: 'save_as',
      newName: 'modified_network.rawx'
    });
    console.log(`✅ File saved: ${saveResult.file_path}\n`);

    // Step 10: Get session info
    console.log('10. Getting final session info...');
    const sessionInfo = await PowerFlowApp.getSessionInfo();
    console.log(`✅ Session info:`);
    console.log(`   - Status: ${sessionInfo.status}`);
    console.log(`   - Method: ${sessionInfo.method}`);
    console.log(`   - Converged: ${sessionInfo.converged}`);
    console.log(`   - Created: ${sessionInfo.created_at}`);
    console.log(`   - Updated: ${sessionInfo.updated_at}\n`);

    console.log('=== Workflow Complete ===\n');
    
    return {
      sessionId,
      network: updatedNetwork,
      calculation: calcResult,
      sessionInfo
    };

  } catch (error) {
    console.error('❌ Workflow failed:', error.message);
    console.error('Error details:', error);
    throw error;
  }
}

// Example: Run batch analysis
async function batchAnalysisExample(sessionId) {
  try {
    console.log('=== Batch Analysis Example ===\n');

    const comparison = await PowerFlowApp.compareAnalysis([
      ANALYSIS_METHODS.DC,
      ANALYSIS_METHODS.FNSL
    ]);

    console.log('Comparison Results:');
    console.log(`- All converged: ${comparison.summary.allConverged}`);
    console.log(`- Fastest method: ${comparison.summary.fastestMethod}`);
    console.log(`- Fastest time: ${comparison.summary.fastestTime}ms\n`);

    Object.entries(comparison.methods).forEach(([method, result]) => {
      console.log(`${method.toUpperCase()}:`);
      console.log(`  - Converged: ${result.converged}`);
      console.log(`  - Time: ${result.time}ms`);
      console.log(`  - Iterations: ${result.iterations}`);
    });

    return comparison;
  } catch (error) {
    console.error('❌ Batch analysis failed:', error.message);
    throw error;
  }
}

// Example: Edit multiple elements
async function multipleEditsExample() {
  try {
    console.log('=== Multiple Edits Example ===\n');

    // Access edit service directly for more control
    const editService = PowerFlowApp.edit;

    // Add a bus
    await editService.addBus({
      ibus: 88888,
      name: 'TEST_BUS_1',
      baskv: 230.0
    });
    console.log('✅ Bus 88888 added');

    // Add a load to that bus
    await editService.addLoad({
      ibus: 88888,
      loadid: '1',
      status: 1,
      pl: 100.0,
      ql: 50.0
    });
    console.log('✅ Load added to bus 88888');

    // Add a generator
    await editService.addGenerator({
      ibus: 88888,
      machid: '1',
      pg: 150.0,
      qg: 75.0,
      vs: 1.0
    });
    console.log('✅ Generator added to bus 88888');

    // Modify the bus voltage
    await editService.modifyBus(
      { ibus: 88888 },
      { vm: 1.05 }
    );
    console.log('✅ Bus voltage modified\n');

    return true;
  } catch (error) {
    console.error('❌ Multiple edits failed:', error.message);
    throw error;
  }
}

// Example: Upload and calculate in one call
async function quickWorkflow(file) {
  try {
    console.log('=== Quick Workflow Example ===\n');

    await PowerFlowApp.initialize({ userId: 'demo_user' });
    
    const sessionId = await PowerFlowApp.createSession();
    
    // Upload and calculate in one call
    const result = await PowerFlowApp.uploadAndCalculate(
      file,
      ANALYSIS_METHODS.DC,
      { sessionId }
    );

    console.log(`✅ Quick workflow complete`);
    console.log(`   - Converged: ${result.results.converged}`);
    console.log(`   - Time: ${result.results.solution_time_ms}ms\n`);

    return result;
  } catch (error) {
    console.error('❌ Quick workflow failed:', error.message);
    throw error;
  }
}

// Export examples
export {
  completeWorkflow,
  batchAnalysisExample,
  multipleEditsExample,
  quickWorkflow
};

// For Node.js testing
if (typeof require !== 'undefined' && require.main === module) {
  console.log('XFlow SDK Examples');
  console.log('Import these functions in your application to use them.');
}
