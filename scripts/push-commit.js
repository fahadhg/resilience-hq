import { execSync } from 'child_process';
import { chdir } from 'process';

try {
  // Change to project directory
  chdir('/vercel/share/v0-project');
  
  console.log('[v0] Current directory:', process.cwd());
  
  // Configure git user
  execSync('git config user.name "v0[bot]"', { stdio: 'inherit' });
  execSync('git config user.email "v0[bot]@users.noreply.github.com"', { stdio: 'inherit' });
  
  // Check git status
  console.log('[v0] Git status:');
  execSync('git status', { stdio: 'inherit' });
  
  // Stage all changes
  console.log('[v0] Staging changes...');
  execSync('git add -A', { stdio: 'inherit' });
  
  // Commit
  console.log('[v0] Creating commit...');
  execSync('git commit -m "refactor: upgrade UI/UX with NGen branding and professional styling\n\n- Update color scheme with NGen orange (#F15A22) as primary accent\n- Switch typography from DM Sans to Inter for cleaner aesthetic\n- Improve Nav bar with larger height, prominent logo, and better visual separation\n- Redesign tool grid from 8-col cramped to 4-col with readable descriptions\n- Replace emoji icons with Lucide icons throughout (BarChart3, Bot, Factory, etc.)\n- Standardize card padding (p-4) and spacing (gap-4) for consistency\n- Add zebra striping to tables for improved scannability\n- Enhance footer with data source cards, disclaimer, and proper branding\n- Move inline keyframes to globals.css and create reusable animations\n- Standardize status indicators with live-dot class and pulse animation\n- Improve Intel Modules section with better tab styling and component hierarchy\n- Add tab scroll indicators and fade gradients for overflow content"', { stdio: 'inherit' });
  
  console.log('[v0] ✓ Commit successful!');
  process.exit(0);
} catch (error) {
  console.error('[v0] Error during commit:', error.message);
  process.exit(1);
}
