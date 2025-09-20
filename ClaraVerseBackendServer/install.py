#!/usr/bin/env python3
"""
ClaraVerse Remote Server Installer
A beautiful, cross-platform installer for ClaraVerse AI services
No external dependencies required - uses only Python standard library
"""

import os
import sys
import subprocess
import json
import time
import platform
import shutil
from typing import List, Dict, Optional

class Colors:
    """ANSI color codes for beautiful terminal output"""
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    BOLD = '\033[1m'
    RESET = '\033[0m'
    
    @staticmethod
    def disable_on_windows():
        """Enable ANSI colors on Windows"""
        if platform.system() == "Windows":
            try:
                # Enable ANSI escape sequences on Windows 10+
                import ctypes
                kernel32 = ctypes.windll.kernel32
                kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            except:
                pass

class ClaraVerseInstaller:
    def __init__(self):
        Colors.disable_on_windows()
        self.services = {
            'clara_comfyui': {
                'name': 'ComfyUI',
                'description': 'AI Image Generation Powerhouse',
                'port': 8188,
                'health_path': '/',
                'selected': False
            },
            'clara_python': {
                'name': 'Python Backend',
                'description': 'Advanced AI Processing APIs',
                'port': 5001,
                'health_path': '/health',
                'selected': False
            },
            'clara_n8n': {
                'name': 'n8n Workflows',
                'description': 'Automation Made Simple',
                'port': 5678,
                'health_path': '/healthz',
                'selected': False
            }
        }
        self.docker_available = False
        self.gpu_available = False
        self.os_type = platform.system().lower()
        
    def clear_screen(self):
        """Clear the terminal screen"""
        os.system('cls' if self.os_type == 'windows' else 'clear')
        
    def print_banner(self):
        """Display beautiful ASCII banner"""
        banner = f"""
{Colors.CYAN}
     #####  #        #####  ######   #####  #     # ####### ######   ##### #######
    #     # #       #     # #     # #     # #     # #       #     # #     # #
    #       #       ####### ######  ####### #     # #####   ######   #####  #####
    #       #       #     # #   #   #     #  #   #  #       #   #        #  #
    #     # #       #     # #    #  #     #  #   #  #       #    #  #     # #
     #####  ####### #     # #     # #     #   ###   ####### #     #  #####  #######
{Colors.RESET}

{Colors.BOLD}{Colors.MAGENTA}                    REMOTE SERVER DEPLOYMENT{Colors.RESET}
{Colors.CYAN}                          The AI-Powered Creative Suite{Colors.RESET}

{Colors.YELLOW}    +==================================================================+{Colors.RESET}
{Colors.YELLOW}    :                                                                  :{Colors.RESET}
{Colors.YELLOW}    :  {Colors.WHITE}ComfyUI     - AI Image Generation Powerhouse{Colors.YELLOW}                :{Colors.RESET}
{Colors.YELLOW}    :  {Colors.WHITE}Python Backend - Advanced AI Processing APIs{Colors.YELLOW}                :{Colors.RESET}
{Colors.YELLOW}    :  {Colors.WHITE}n8n Workflows - Automation Made Simple{Colors.YELLOW}                      :{Colors.RESET}
{Colors.YELLOW}    :                                                                  :{Colors.RESET}
{Colors.YELLOW}    +==================================================================+{Colors.RESET}

{Colors.GREEN}        Auto-GPU Detection  -  Secure Deployment  -  Production Ready{Colors.RESET}
"""
        print(banner)
        time.sleep(2)
        
    def print_section_header(self, title: str):
        """Print a beautiful section header"""
        print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.WHITE}                        [{title}]                          {Colors.RESET}")
        print(f"{Colors.BLUE}{'='*80}{Colors.RESET}\n")
        
    def print_progress(self, step: int, total: int, message: str):
        """Print a progress indicator"""
        percentage = (step / total) * 100
        filled = int(50 * step // total)
        bar = '█' * filled + '-' * (50 - filled)
        print(f"\r{Colors.CYAN}[{bar}] {percentage:.1f}% {message}{Colors.RESET}", end='', flush=True)
        
    def log_info(self, message: str):
        """Log an info message"""
        print(f"{Colors.GREEN}[✓] {message}{Colors.RESET}")
        
    def log_warning(self, message: str):
        """Log a warning message"""
        print(f"{Colors.YELLOW}[!] {message}{Colors.RESET}")
        
    def log_error(self, message: str):
        """Log an error message"""
        print(f"{Colors.RED}[✗] {message}{Colors.RESET}")
        
    def run_command(self, command: List[str], capture_output: bool = True) -> tuple:
        """Run a shell command and return (success, output)"""
        try:
            if capture_output:
                result = subprocess.run(command, capture_output=True, text=True, timeout=30)
                return result.returncode == 0, result.stdout.strip()
            else:
                result = subprocess.run(command, timeout=60)
                return result.returncode == 0, ""
        except subprocess.TimeoutExpired:
            return False, "Command timed out"
        except Exception as e:
            return False, str(e)
            
    def check_docker(self) -> bool:
        """Check if Docker is installed and running"""
        print(f"{Colors.YELLOW}[*] Checking Docker installation...{Colors.RESET}")
        
        # Check if docker command exists
        success, output = self.run_command(['docker', '--version'])
        if not success:
            self.log_error("Docker is not installed or not in PATH")
            self.print_docker_install_instructions()
            return False
            
        # Check if Docker daemon is running
        success, output = self.run_command(['docker', 'ps'])
        if not success:
            self.log_error("Docker daemon is not running")
            self.log_warning("Please start Docker Desktop and try again")
            return False
            
        self.log_info(f"Docker is available: {output}")
        return True
        
    def print_docker_install_instructions(self):
        """Print Docker installation instructions"""
        print(f"\n{Colors.YELLOW}Please install Docker:{Colors.RESET}")
        if self.os_type == 'windows':
            print(f"{Colors.WHITE}   1. Download Docker Desktop for Windows{Colors.RESET}")
            print(f"{Colors.WHITE}   2. https://docs.docker.com/desktop/windows/install/{Colors.RESET}")
        elif self.os_type == 'darwin':
            print(f"{Colors.WHITE}   1. Download Docker Desktop for Mac{Colors.RESET}")
            print(f"{Colors.WHITE}   2. https://docs.docker.com/desktop/mac/install/{Colors.RESET}")
        else:
            print(f"{Colors.WHITE}   1. Install Docker Engine: sudo apt install docker.io{Colors.RESET}")
            print(f"{Colors.WHITE}   2. Start Docker: sudo systemctl start docker{Colors.RESET}")
            
    def check_gpu(self) -> bool:
        """Check if NVIDIA GPU is available"""
        print(f"{Colors.YELLOW}[*] Checking GPU availability...{Colors.RESET}")
        
        # Check for nvidia-smi
        success, output = self.run_command(['nvidia-smi'])
        if success and 'NVIDIA' in output:
            self.log_info("NVIDIA GPU detected - CUDA acceleration will be enabled")
            return True
        else:
            self.log_warning("No NVIDIA GPU detected - using CPU mode")
            return False
            
    def select_services(self):
        """Interactive service selection"""
        self.print_section_header("SERVICE SELECTION")
        
        print(f"{Colors.WHITE}Please select which services you want to deploy:{Colors.RESET}\n")
        
        for i, (service_id, service) in enumerate(self.services.items(), 1):
            print(f"{Colors.CYAN}   [{i}] {service['name']:<15} {Colors.WHITE}- {service['description']} (Port {service['port']}){Colors.RESET}")
        print(f"{Colors.CYAN}   [A] All Services     {Colors.WHITE}- Deploy everything (Recommended){Colors.RESET}\n")
        
        while True:
            choice = input(f"{Colors.YELLOW}Select services (e.g., 1,3 or A for all): {Colors.RESET}").strip()
            
            if choice.upper() == 'A':
                for service in self.services.values():
                    service['selected'] = True
                self.log_info("All services selected for deployment")
                break
            elif choice:
                # Reset selections
                for service in self.services.values():
                    service['selected'] = False
                    
                # Parse selections
                service_list = list(self.services.keys())
                for char in choice.replace(',', '').replace(' ', ''):
                    if char.isdigit():
                        idx = int(char) - 1
                        if 0 <= idx < len(service_list):
                            self.services[service_list[idx]]['selected'] = True
                            
                # Check if any service selected
                if any(service['selected'] for service in self.services.values()):
                    break
                else:
                    self.log_error("No valid services selected. Please try again.")
            else:
                self.log_error("Please enter a selection.")
                
        # Show selected services
        print(f"\n{Colors.WHITE}Selected services:{Colors.RESET}")
        for service in self.services.values():
            if service['selected']:
                print(f"{Colors.GREEN}  ✓ {service['name']}{Colors.RESET}")
        print()
        time.sleep(2)
        
    def deploy_services(self):
        """Deploy selected services using Docker Compose"""
        self.print_section_header("DEPLOYMENT")
        
        # Build service list
        selected_services = [service_id for service_id, service in self.services.items() if service['selected']]
        
        if not selected_services:
            self.log_error("No services selected for deployment")
            return False
            
        print(f"{Colors.YELLOW}[*] Deploying selected services: {', '.join(selected_services)}{Colors.RESET}")
        
        # Pull images
        print(f"{Colors.YELLOW}[*] Pulling Docker images (this may take several minutes)...{Colors.RESET}")
        pull_cmd = ['docker', 'compose', 'pull'] + selected_services
        success, output = self.run_command(pull_cmd, capture_output=False)
        
        if not success:
            self.log_error("Failed to pull Docker images")
            return False
            
        # Start services
        print(f"\n{Colors.YELLOW}[*] Starting services...{Colors.RESET}")
        up_cmd = ['docker', 'compose', 'up', '-d'] + selected_services
        success, output = self.run_command(up_cmd, capture_output=False)
        
        if not success:
            self.log_error("Failed to start services")
            return False
            
        self.log_info("Services started successfully")
        return True
        
    def check_service_health(self, port: int, path: str) -> bool:
        """Check if a service is healthy using HTTP request"""
        try:
            import urllib.request
            import urllib.error
            
            url = f'http://localhost:{port}{path}'
            request = urllib.request.Request(url)
            response = urllib.request.urlopen(request, timeout=5)
            return response.getcode() == 200
        except:
            return False
    
    def wait_for_services(self):
        """Wait for services to become healthy"""
        self.print_section_header("HEALTH CHECK")
        
        print(f"{Colors.YELLOW}[*] Waiting for services to become healthy...{Colors.RESET}")
        max_attempts = 24
        
        for attempt in range(max_attempts):
            all_healthy = True
            
            for service_id, service in self.services.items():
                if not service['selected']:
                    continue
                    
                port = service['port']
                health_path = service['health_path']
                
                # Check service health using pure Python HTTP request
                if not self.check_service_health(port, health_path):
                    all_healthy = False
                    break
                    
            if all_healthy:
                print(f"\n{Colors.GREEN}[✓] All selected services are healthy and ready!{Colors.RESET}")
                return True
                
            self.print_progress(attempt + 1, max_attempts, f"Checking service health (attempt {attempt + 1}/{max_attempts})")
            time.sleep(5)
            
        print(f"\n{Colors.YELLOW}[!] Services are taking longer than expected to start{Colors.RESET}")
        self.log_info("You can check status with: docker compose ps")
        return True
        
    def show_success_message(self):
        """Display final success message"""
        self.clear_screen()
        
        print(f"""
{Colors.GREEN}
    ######  ####### ######  #       ####### #     # ####### ######
    #     # #       #     # #       #     #  #   #  #       #     #
    #     # #####   ######  #       #     #   # #   #####   #     #
    #     # #       #       #       #     #    #    #       #     #
    #     # #       #       #       #     #    #    #       #     #
    ######  ####### #       ####### #######    #    ####### ###### 
{Colors.RESET}

{Colors.BOLD}{Colors.MAGENTA}    +=================================================================+{Colors.RESET}
{Colors.BOLD}{Colors.MAGENTA}    :                                                                 :{Colors.RESET}
{Colors.BOLD}{Colors.MAGENTA}    :             CLARAVERSE DEPLOYMENT SUCCESSFUL!                  :{Colors.RESET}
{Colors.BOLD}{Colors.MAGENTA}    :                                                                 :{Colors.RESET}
{Colors.BOLD}{Colors.MAGENTA}    +=================================================================+{Colors.RESET}
""")
        
        print(f"{Colors.CYAN}Your selected ClaraVerse services are now running:{Colors.RESET}\n")
        
        # Get local IP
        try:
            import socket
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
        except:
            local_ip = 'localhost'
            
        print(f"{Colors.WHITE}    +-----------------------------------------------------------------+{Colors.RESET}")
        print(f"{Colors.WHITE}    :                                                                 :{Colors.RESET}")
        
        for service in self.services.values():
            if service['selected']:
                service_name = service['name']
                port = service['port']
                print(f"{Colors.WHITE}    :  {Colors.BOLD}{Colors.BLUE}{service_name:<13}{Colors.RESET} {Colors.YELLOW}http://{local_ip}:{port}{Colors.RESET}")
                
        print(f"{Colors.WHITE}    :                                                                 :{Colors.RESET}")
        print(f"{Colors.WHITE}    +-----------------------------------------------------------------+{Colors.RESET}\n")
        
        # Management commands
        print(f"{Colors.GREEN}Quick Management Commands:{Colors.RESET}")
        print(f"{Colors.CYAN}    Check Status: {Colors.WHITE}docker compose ps{Colors.RESET}")
        print(f"{Colors.CYAN}    View Logs:    {Colors.WHITE}docker compose logs -f{Colors.RESET}")
        print(f"{Colors.CYAN}    Restart:      {Colors.WHITE}docker compose restart{Colors.RESET}")
        print(f"{Colors.CYAN}    Stop:         {Colors.WHITE}docker compose down{Colors.RESET}\n")
        
        # System info
        print(f"{Colors.BOLD}{Colors.GREEN}System Specifications:{Colors.RESET}")
        if self.gpu_available:
            print(f"{Colors.WHITE}  • GPU: NVIDIA GPU with CUDA support{Colors.RESET}")
        else:
            print(f"{Colors.WHITE}  • Mode: CPU-only deployment{Colors.RESET}")
            
        print(f"{Colors.WHITE}  • Services: {', '.join([s['name'] for s in self.services.values() if s['selected']])}{Colors.RESET}")
        print(f"{Colors.WHITE}  • Platform: {platform.system()} {platform.release()}{Colors.RESET}\n")
        
        print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.WHITE}Thank you for using ClaraVerse! Happy creating!{Colors.RESET}")
        print(f"{Colors.BLUE}{'='*80}{Colors.RESET}\n")
        
        # Open browser to first service
        first_service = next((s for s in self.services.values() if s['selected']), None)
        if first_service:
            try:
                import webbrowser
                url = f"http://{local_ip}:{first_service['port']}"
                input(f"{Colors.YELLOW}Press Enter to open {first_service['name']} in your browser...{Colors.RESET}")
                webbrowser.open(url)
                self.log_info(f"Browser opened to {first_service['name']}")
            except:
                pass
                
    def run(self):
        """Main installation flow"""
        try:
            self.clear_screen()
            self.print_banner()
            
            # System checks
            self.print_section_header("SYSTEM VERIFICATION")
            
            # Check Docker
            self.docker_available = self.check_docker()
            if not self.docker_available:
                return False
                
            # Check GPU
            self.gpu_available = self.check_gpu()
            
            # Service selection
            self.select_services()
            
            # Deploy services
            if not self.deploy_services():
                return False
                
            # Wait for health
            self.wait_for_services()
            
            # Show success
            self.show_success_message()
            
            return True
            
        except KeyboardInterrupt:
            print(f"\n{Colors.YELLOW}Installation cancelled by user{Colors.RESET}")
            return False
        except Exception as e:
            self.log_error(f"Unexpected error: {e}")
            return False

def main():
    """Main entry point"""
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help']:
        print("""
ClaraVerse Remote Server Installer

A beautiful, cross-platform installer for ClaraVerse AI services.
This installer will help you deploy ComfyUI, Python Backend, and n8n services.

Usage:
    python install.py          # Interactive installation
    python install.py --help   # Show this help

Requirements:
    - Python 3.6+
    - Docker or Docker Desktop
    - Internet connection

Services:
    - ComfyUI:        AI Image Generation (Port 8188)
    - Python Backend: AI Processing APIs (Port 5001)  
    - n8n:           Workflow Automation (Port 5678)
        """)
        return
        
    installer = ClaraVerseInstaller()
    success = installer.run()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()