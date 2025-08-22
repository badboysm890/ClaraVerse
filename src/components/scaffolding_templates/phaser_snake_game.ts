// Phaser Snake Game Scaffold Template

import { ProjectScaffoldConfig } from '../../services/projectScaffolder';

const phaserSnakeGameConfig: ProjectScaffoldConfig = {
  id: 'phaser-snake-game',
  name: 'Phaser Snake Game',
  description: 'A minimal Phaser 3 project with a working Snake game.',
  icon: '🐍',
  category: 'Game',
  setupSteps: [
    {
      name: 'init-npm',
      description: 'Initialize npm project',
      command: 'npm',
      args: ['init', '-y'],
      successMessage: '✅ npm project initialized',
      timeout: 30000
    },
    {
      name: 'install-deps',
      description: 'Install Phaser and Parcel',
      command: 'npm',
      args: ['install', 'phaser', 'parcel'],
      successMessage: '✅ Phaser and Parcel installed',
      timeout: 60000
    },
    {
      name: 'create-src-dir',
      description: 'Create src directory',
      command: 'mkdir',
      args: ['-p', 'src'],
      successMessage: '✅ src directory created',
      timeout: 10000
    },
    {
      name: 'create-index-html',
      description: 'Create index.html',
      command: 'node',
      args: [
        '-e',
        'require("fs").writeFileSync("src/index.html", `<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>Phaser Snake Game</title>\n  <style>body { margin: 0; background: #181818; color: #fff; font-family: sans-serif; } #game-container { display: flex; justify-content: center; align-items: center; height: 100vh; }</style>\n</head>\n<body>\n  <div id=\"game-container\"></div>\n  <script src=\"index.js\"></script>\n</body>\n</html>\n`);'
      ],
      successMessage: '✅ index.html created',
      timeout: 10000
    },
    {
      name: 'create-index-js',
      description: 'Create index.js',
      command: 'node',
      args: [
        '-e',
        'require("fs").writeFileSync("src/index.js", `import Phaser from \'phaser\'\nimport SnakeScene from \'./snakeScene\'\n\nconst config = {\n  type: Phaser.AUTO,\n  width: 400,\n  height: 400,\n  backgroundColor: \'#222\',\n  parent: \'game-container\',\n  scene: [SnakeScene],\n};\n\nnew Phaser.Game(config);\n`);'
      ],
      successMessage: '✅ index.js created',
      timeout: 10000
    },
    {
      name: 'create-snakeScene-js',
      description: 'Create snakeScene.js',
      command: 'node',
      args: [
        '-e',
        'require("fs").writeFileSync("src/snakeScene.js", `import Phaser from \'phaser\'\n\nexport default class SnakeScene extends Phaser.Scene {\n  constructor() {\n    super(\'SnakeScene\');\n    this.snake = [];\n    this.direction = \'RIGHT\';\n    this.food = null;\n    this.score = 0;\n    this.moveTimer = 0;\n  }\n\n  preload() {}\n\n  create() {\n    this.snake = [\n      { x: 8, y: 8 },\n      { x: 7, y: 8 },\n      { x: 6, y: 8 },\n    ];\n    this.direction = \'RIGHT\';\n    this.score = 0;\n    this.cellSize = 20;\n    this.gridSize = 20;\n    this.moveDelay = 120;\n    this.moveTimer = 0;\n    this.food = this.randomFood();\n    this.input.keyboard.on(\'keydown\', this.handleKey, this);\n  }\n\n  update(time, delta) {\n    this.moveTimer += delta;\n    if (this.moveTimer >= this.moveDelay) {\n      this.moveSnake();\n      this.moveTimer = 0;\n    }\n    this.draw();\n  }\n\n  handleKey(event) {\n    const { direction } = this;\n    if (event.key === \'ArrowUp\' && direction !== \'DOWN\') this.direction = \'UP\';\n    else if (event.key === \'ArrowDown\' && direction !== \'UP\') this.direction = \'DOWN\';\n    else if (event.key === \'ArrowLeft\' && direction !== \'RIGHT\') this.direction = \'LEFT\';\n    else if (event.key === \'ArrowRight\' && direction !== \'LEFT\') this.direction = \'RIGHT\';\n  }\n\n  moveSnake() {\n    const head = { ...this.snake[0] };\n    if (this.direction === \'UP\') head.y -= 1;\n    else if (this.direction === \'DOWN\') head.y += 1;\n    else if (this.direction === \'LEFT\') head.x -= 1;\n    else if (this.direction === \'RIGHT\') head.x += 1;\n\n    // Check collision\n    if (\n      head.x < 0 || head.x >= this.gridSize ||\n      head.y < 0 || head.y >= this.gridSize ||\n      this.snake.some(seg => seg.x === head.x && seg.y === head.y)\n    ) {\n      this.scene.restart();\n      return;\n    }\n\n    this.snake.unshift(head);\n    if (head.x === this.food.x && head.y === this.food.y) {\n      this.food = this.randomFood();\n      this.score++;\n    } else {\n      this.snake.pop();\n    }\n  }\n\n  randomFood() {\n    let pos;\n    do {\n      pos = {\n        x: Phaser.Math.Between(0, this.gridSize - 1),\n        y: Phaser.Math.Between(0, this.gridSize - 1),\n      };\n    } while (this.snake.some(seg => seg.x === pos.x && seg.y === pos.y));\n    return pos;\n  }\n\n  draw() {\n    this.cameras.main.setBackgroundColor(\'#222\');\n    this.add.graphics().clear();\n    const g = this.add.graphics();\n    // Draw snake\n    g.fillStyle(0x00ff00, 1);\n    for (const seg of this.snake) {\n      g.fillRect(seg.x * this.cellSize, seg.y * this.cellSize, this.cellSize - 2, this.cellSize - 2);\n    }\n    // Draw food\n    g.fillStyle(0xff0000, 1);\n    g.fillRect(this.food.x * this.cellSize, this.food.y * this.cellSize, this.cellSize - 2, this.cellSize - 2);\n    // Draw score\n    this.add.text(10, 10, `Score: ${this.score}`, { font: \'16px Arial\', fill: \'#fff\' });\n  }\n}\n`);'
      ],
      successMessage: '✅ snakeScene.js created',
      timeout: 10000
    }
  ]
};

export default phaserSnakeGameConfig; 
