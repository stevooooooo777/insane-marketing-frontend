/*!
 * ═══════════════════════════════════════════════════════════════
 * insane.marketing - Luxury Hospitality Intelligence Platform
 * ═══════════════════════════════════════════════════════════════
 * 
 * Copyright (c) 2024-2025 insane.marketing
 * All Rights Reserved - Proprietary and Confidential

 * 
 * NOTICE: This code contains proprietary business logic and trade secrets.
 * 
 * Unauthorized use, reproduction, or distribution of this code,
 * or any portion of it, may result in severe civil and criminal penalties,
 * and will be prosecuted to the maximum extent possible under the law.

 * 
 * Key Protected Features:
 * - Zero-Knowledge Architecture & Data Handling
 * - Time Machine Transformation Visualization System
 * - VIP Prediction & Recognition Engine
 * - Service Recovery Intelligence System
 * - Real-time Mission Control Analytics

 * Protected by AI tracking - active
 * For licensing inquiries: steve@insane.marketing

 * ═══════════════════════════════════════════════════════════════
 */













const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');

console.log('🔨 Starting build process...\n');

// Create dist folder
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
  console.log('✅ Created dist/ folder\n');
}

// AUTO-FIND all HTML files in root directory
const allFiles = fs.readdirSync('.');
const htmlFiles = allFiles.filter(f => f.endsWith('.html'));

console.log(`📄 Found ${htmlFiles.length} HTML files:`, htmlFiles.join(', '), '\n');

// Process each HTML file
htmlFiles.forEach(file => {
  console.log(`🔒 Processing ${file}...`);
  
  try {
    let html = fs.readFileSync(file, 'utf8');
    
    // Find all <script> tags with content
    const scriptRegex = /<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi;
    
    html = html.replace(scriptRegex, (match, attributes, scriptContent) => {
      // Skip empty scripts
      if (!scriptContent.trim()) {
        return match;
      }
      
      try {
        // Obfuscate the JavaScript content
        const obfuscated = JavaScriptObfuscator.obfuscate(scriptContent, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.5,
          stringArray: true,
          stringArrayThreshold: 0.75,
          transformObjectKeys: true,
          unicodeEscapeSequence: false
        });
        
        return `<script${attributes}>${obfuscated.getObfuscatedCode()}</script>`;
      } catch (err) {
        console.log(`   ⚠️  Could not obfuscate script in ${file}: ${err.message}`);
        return match; // Keep original if obfuscation fails
      }
    });
    
    fs.writeFileSync(`dist/${file}`, html);
    console.log(`   ✅ Created dist/${file}`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
});

// Pure JS files (obfuscate entire file)
const jsFiles = ['config-client.js'];

jsFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    return;
  }
  
  console.log(`🔒 Obfuscating ${file}...`);
  
  try {
    const code = fs.readFileSync(file, 'utf8');
    
    const obfuscated = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.5,
      stringArray: true,
      stringArrayThreshold: 0.75,
      transformObjectKeys: true,
      unicodeEscapeSequence: false
    });
    
    fs.writeFileSync(`dist/${file}`, obfuscated.getObfuscatedCode());
    console.log(`   ✅ Created dist/${file}`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
});

// Copy files that don't need obfuscation
console.log('\n📋 Copying other files...');

if (fs.existsSync('_redirects')) {
  fs.copyFileSync('_redirects', 'dist/_redirects');
  console.log('   ✅ Copied _redirects');
}

// Copy CSS files
const cssFiles = allFiles.filter(f => f.endsWith('.css'));
cssFiles.forEach(file => {
  fs.copyFileSync(file, `dist/${file}`);
  console.log(`   ✅ Copied ${file}`);
});

// Copy image files
const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
const imageFiles = allFiles.filter(f => 
  imageExtensions.some(ext => f.toLowerCase().endsWith(ext))
);
imageFiles.forEach(file => {
  fs.copyFileSync(file, `dist/${file}`);
  console.log(`   ✅ Copied ${file}`);
});

console.log('\n🎉 Build complete!');
console.log('📂 Obfuscated files are in the dist/ folder');
console.log('🚀 Deploy the dist/ folder to Netlify\n');