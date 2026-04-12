import { execSync } from 'child_process';
import process from 'process';

try {
  console.log('[v0] Current working directory:', process.cwd());
  
  // Check git status
  const status = execSync('git status --porcelain', { 
    cwd: '/vercel/share/v0-project',
    encoding: 'utf-8' 
  });
  
  console.log('[v0] Git status:\n', status);
  
  // Stage all changes
  execSync('git add -A', { 
    cwd: '/vercel/share/v0-project',
    stdio: 'inherit'
  });
  
  console.log('[v0] Staged all changes');
  
  // Commit with descriptive message
  execSync('git commit -m "UI: Align with NGen branding and improve overall design\n\n- Updated color scheme to use NGen orange (#F15A22) as primary brand color\n- Switched typography from DM Sans to Inter for cleaner, professional look\n- Improved Nav bar with larger height, better visual weight, and RHQ logo\n- Fixed tool grid from 8-col cramped to 4-col with proper spacing\n- Replaced all emojis with Lucide icons throughout the app\n- Standardized card padding to p-4 with consistent gap-4 spacing\n- Added zebra striping to all tables for better readability\n- Added tab scroll indicator with fade gradient\n- Enhanced footer with data source cards and proper NGen branding\n- Moved all keyframe animations to globals.css (removed inline styles)\n- Standardized status dots with live-dot class and pulse animation\n- Improved Intel Modules section with better tab styling and icon integration\n- Better overall visual hierarchy and component consistency"', { 
    cwd: '/vercel/share/v0-project',
    stdio: 'inherit'
  });
  
  console.log('[v0] Commit successful!');
  
  // Show the commit
  const commit = execSync('git log -1 --oneline', { 
    cwd: '/vercel/share/v0-project',
    encoding: 'utf-8'
  });
  
  console.log('[v0] Latest commit:', commit);
  
} catch (error) {
  console.error('[v0] Error during commit:', error.message);
  process.exit(1);
}
