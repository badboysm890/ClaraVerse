/**
 * 🎯 Example 1: Using JSON Export Format
 * 
 * This is the EASIEST way to use flows exported from angela Agent Studio!
 * 
 * Think of it like this:
 * 1. You build a cool workflow in angela Agent Studio 🎨
 * 2. You export it as JSON (like saving a recipe) 📄
 * 3. You load that JSON and run it with your data! 🚀
 * 
 * Perfect for: Beginners, quick prototypes, simple automation
 */

import { angelaFlowRunner } from 'angela-flow-sdk';
import fs from 'fs';

// 📚 Step 1: Create the SDK runner (like getting ready to cook)
const runner = new angelaFlowRunner({
  enableLogging: true,    // See what's happening
  logLevel: 'info'        // Show important messages
});

async function runSentimentAnalysis() {
  console.log('🤖 Starting Sentiment Analysis with JSON Format!');
  console.log('='.repeat(50));

  try {
    // 📖 Step 2: Load your workflow JSON (like reading a recipe)
    console.log('📄 Loading workflow from JSON file...');
    const workflowJSON = JSON.parse(
      fs.readFileSync('./NewWorkFLow_flow_sdk.json', 'utf8')
    );
    
    console.log(`✅ Loaded workflow: "${workflowJSON.flow.name}"`);
    console.log(`📊 Contains ${workflowJSON.flow.nodes.length} nodes`);

    // 🎯 Step 3: Prepare your data (like gathering ingredients)
    const inputData = {
      // This goes to the first Input node (user feedback)
      'Input_1': 'Your product is amazing! I love it so much!',
      
      // This goes to the second Input node (JSON format example) 
      'Input_2': JSON.stringify({
        "sentence": "sentence from the user",
        "sentiment": "good, bad, very bad", 
        "reason": "reason for the choice"
      }),
      
      // This goes to the third Input node (context)
      'Input_3': 'This is customer feedback about our product'
    };

    console.log('🎯 Input data prepared:');
    console.log('- User Feedback:', inputData.Input_1);
    console.log('- JSON Format: Ready ✅');
    console.log('- Context: Ready ✅');

    // 🚀 Step 4: Run the workflow! (like following the recipe)
    console.log('\n⚡ Executing workflow...');
    const result = await runner.executeFlow(workflowJSON, inputData);

    // 🎉 Step 5: See the magic happen!
    console.log('\n🎉 Results:');
    console.log('='.repeat(30));
    
    // The workflow returns structured sentiment analysis
    if (result) {
      console.log('📊 Sentiment Analysis:', JSON.stringify(result, null, 2));
      
      // Check if it detected "very bad" sentiment
      if (result.sentiment === 'very bad') {
        console.log('🚨 Alert: Very negative feedback detected!');
      } else {
        console.log('✅ Feedback processed successfully');
      }
    }

  } catch (error) {
    console.error('❌ Oops! Something went wrong:', error.message);
    console.log('\n🤔 Common issues:');
    console.log('- Make sure the JSON file exists');
    console.log('- Check if the API key is set correctly');
    console.log('- Verify the input data matches what the workflow expects');
  }
}

// 🎬 Let's run our example!
runSentimentAnalysis();

/**
 * 💡 What just happened?
 * 
 * 1. We loaded a pre-built workflow from JSON
 * 2. The workflow analyzes text sentiment using AI  
 * 3. It returns structured data (JSON) with the analysis
 * 4. We can then use that data in our app!
 * 
 * 🔥 Why use JSON format?
 * ✅ Super easy - just export and run
 * ✅ No coding required for the workflow logic
 * ✅ Perfect for non-programmers
 * ✅ Great for sharing workflows between teams
 * 
 * 🎯 Next steps:
 * - Try changing the input text
 * - Export different workflows from angela Studio
 * - Combine multiple workflows together
 */ 
