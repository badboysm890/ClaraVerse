/**
 * 🚀 Example 2: Using JavaScript Class Export Format
 * 
 * This is for when you want MORE POWER and CONTROL! 💪
 * 
 * Think of it like this:
 * 1. You build a workflow in angela Agent Studio 🎨
 * 2. You export it as a JavaScript class (like a reusable tool) 🔧
 * 3. You can use it like any other JavaScript module! ⚡
 * 
 * Perfect for: Developers, reusable components, production apps
 */

// 📦 Step 1: Import your exported workflow class
import { NewWorkFLowFlow } from './NewWorkFLow_flow.js';

async function runAdvancedSentimentAnalysis() {
  console.log('🚀 Starting Advanced Sentiment Analysis with JS Class!');
  console.log('='.repeat(55));

  try {
    // 🛠️ Step 2: Create an instance of your workflow (like getting a tool ready)
    console.log('🔧 Creating workflow instance...');
    const sentimentWorkflow = new NewWorkFLowFlow({
      enableLogging: true,
      logLevel: 'debug'  // Show detailed info
    });
    
    console.log('✅ Workflow instance created!');
    
    // 📋 Step 3: Let's see what this workflow can do
    const flowInfo = sentimentWorkflow.getFlowInfo();
    console.log(`📊 Workflow Name: ${flowInfo.name}`);
    console.log(`📈 Total Nodes: ${flowInfo.nodeCount}`);
    console.log(`🔗 Connections: ${flowInfo.connectionCount}`);

    // 🎯 Step 4: Test with different types of feedback
    const testCases = [
      {
        name: 'Happy Customer',
        feedback: 'This product is absolutely fantastic! Best purchase ever!',
        context: 'Product review from verified buyer'
      },
      {
        name: 'Neutral Customer', 
        feedback: 'The product is okay, nothing special but works fine.',
        context: 'Standard product feedback'
      },
      {
        name: 'Very Unhappy Customer',
        feedback: 'This product is terrible! Complete waste of money!',
        context: 'Complaint from customer service'
      }
    ];

    // 🔄 Step 5: Process each test case
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n🧪 Test Case ${i + 1}: ${testCase.name}`);
      console.log('-'.repeat(40));
      
      // Prepare the input data for this workflow
      const inputs = {
        // The workflow expects these specific input names
        'user_feedback': testCase.feedback,
        'json_format': JSON.stringify({
          "sentence": "sentence from the user",
          "sentiment": "good, bad, very bad",
          "reason": "reason for the choice"
        }),
        'analysis_context': testCase.context
      };

      console.log(`📝 Processing: "${testCase.feedback}"`);
      
      // 🚀 Execute the workflow
      const result = await sentimentWorkflow.execute(inputs);
      
      // 📊 Display results
      console.log('📊 Analysis Result:');
      if (result) {
        // Pretty print the result
        const analysis = typeof result === 'string' ? JSON.parse(result) : result;
        console.log(`   Sentiment: ${analysis.sentiment || 'Unknown'}`);
        console.log(`   Reason: ${analysis.reason || 'No reason provided'}`);
        
        // React based on sentiment
        if (analysis.sentiment === 'very bad') {
          console.log('🚨 ALERT: Critical feedback - needs immediate attention!');
        } else if (analysis.sentiment === 'bad') {
          console.log('⚠️  Warning: Negative feedback - follow up recommended');
        } else {
          console.log('✅ Positive/Neutral feedback - all good!');
        }
      }
    }

    // 🎊 Step 6: Batch processing example
    console.log('\n\n🔥 Bonus: Batch Processing Multiple Feedbacks!');
    console.log('='.repeat(50));
    
    const batchInputs = [
      {
        'user_feedback': 'Love this app!',
        'json_format': JSON.stringify({
          "sentence": "sentence from the user",
          "sentiment": "good, bad, very bad",
          "reason": "reason for the choice"
        }),
        'analysis_context': 'App store review'
      },
      {
        'user_feedback': 'App crashes constantly, very frustrating!',
        'json_format': JSON.stringify({
          "sentence": "sentence from the user", 
          "sentiment": "good, bad, very bad",
          "reason": "reason for the choice"
        }),
        'analysis_context': 'Bug report'
      }
    ];

    console.log('⚡ Processing multiple feedbacks at once...');
    const batchResults = await sentimentWorkflow.executeBatch(batchInputs, {
      maxConcurrency: 2  // Process 2 at a time
    });

    console.log(`✅ Processed ${batchResults.length} feedbacks:`);
    batchResults.forEach((result, index) => {
      const analysis = typeof result === 'string' ? JSON.parse(result) : result;
      console.log(`   ${index + 1}. ${analysis.sentiment || 'Unknown'}: ${analysis.reason || 'No reason'}`);
    });

  } catch (error) {
    console.error('❌ Something went wrong:', error.message);
    console.log('\n🤔 Troubleshooting tips:');
    console.log('- Check if the workflow class file exists');
    console.log('- Verify API keys are configured');
    console.log('- Make sure input names match what the workflow expects');
    console.log('- Check the angela SDK is properly installed');
  }
}

// 🎬 Run our advanced example!
runAdvancedSentimentAnalysis();

/**
 * 💡 What's different about the JS Class format?
 * 
 * 🔥 Advantages:
 * ✅ More programming power and flexibility
 * ✅ Type checking and IDE autocomplete
 * ✅ Easier to integrate into existing codebases
 * ✅ Better for complex applications
 * ✅ Can add custom methods and properties
 * ✅ Perfect for team development
 * 
 * 🎯 Key Features We Used:
 * - .execute() - Run the workflow once
 * - .executeBatch() - Process multiple inputs efficiently
 * - .getFlowInfo() - Get workflow metadata
 * - Custom error handling and logging
 * 
 * 🚀 When to use JS Class vs JSON?
 * 
 * Use JSON when:
 * - You're just starting out
 * - Quick prototypes and testing
 * - Non-technical team members
 * - Simple automation scripts
 * 
 * Use JS Class when:
 * - Building production applications
 * - Need advanced features (batch processing, callbacks)
 * - Want better IDE support and debugging
 * - Integrating with existing JavaScript/TypeScript projects
 * 
 * 🎉 Both formats work with the same angela Agent Studio workflows!
 */ 
