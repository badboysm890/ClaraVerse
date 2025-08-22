// Add execute method to tool during creation or registration
const createTool = async (name: string, description: string, parameters: any[]) => {
  const tool = {
    name,
    description,
    parameters,
    isEnabled: true,
    // Add an execute method based on the tool name
    execute: async (args: any) => {
      if (name === 'get_time') {
        const timezone = args.timezone || 'UTC';
        const format = args.format || '24h';
        
        const now = new Date();
        let timeString;
        
        try {
          if (format === '12h') {
            timeString = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              minute: 'numeric',
              second: 'numeric',
              hour12: true,
              timeZone: timezone
            }).format(now);
          } else {
            timeString = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              minute: 'numeric',
              second: 'numeric',
              hour12: false,
              timeZone: timezone
            }).format(now);
          }
          
          return {
            time: timeString,
            timezone: timezone,
            format: format
          };
        } catch (err) {
          return {
            error: `Invalid timezone: ${timezone}`,
            fallback_time: new Date().toISOString()
          };
        }
      }
      
      // Add implementations for other tools
      
      return {
        error: `Tool execution not implemented: ${name}`,
        args: args
      };
    }
  };
  
  await db.addTool(tool);
  return tool;
}; 
