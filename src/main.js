
import Phaser from 'phaser';

// =====================================================
// EIHS DEFENSE — STEP 17
// Two-Direction Walking + Spinning Sword Combat
// =====================================================

const WIDTH = 960;
const HEIGHT = 600;

const ARENA = {
  left: 30,
  top: 70,
  right: 930,
  bottom: 540
};

const SETTINGS = {
  duration: 90,
  playerSpeed: 220,
  playerMaxHP: 100,
  contactDamage: 10,
  damageInvulnerability: 1000,

  slimeHP: 2,
  slimeStartSpeed: 60,
  slimeEndSpeed: 105,
  slimeStartSpawnMs: 2000,
  slimeEndSpawnMs: 650,
  maxSlimes: 85,

  attackRange: 120,
  attackCooldown: 450,
  attackFPS: 16,
  attackStartFrame: 2,
  attackEndFrame: 4,

  knockbackSpeed: 260,
  knockbackDuration: 180
};

// Directional artwork registry.
// Add new PixelLab directions here as they're uploaded.
const WALK_ART = {
  S: {
    texture: 'engineer-s',
    file: '/eihs_engineer_s_walk_8frames.png'
  },
  SW: {
    texture: 'engineer-sw',
    file: '/eihs_engineer_sw_walk_8frames.png'
  }
};

class DefenseScene extends Phaser.Scene {
  constructor() {
    super('DefenseScene');
  }

  preload() {
    // Load available directional walking sheets
    Object.values(WALK_ART).forEach(asset => {
      this.load.spritesheet(
        asset.texture,
        asset.file,
        { frameWidth: 256, frameHeight: 256 }
      );
    });

    this.load.spritesheet(
      'engineer-attack',
      '/eihs_engineer_sw_attack_8frames.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet(
      'slime',
      '/eihs_green_slime_walk_8frames.png',
      { frameWidth: 56, frameHeight: 56 }
    );
  }

  create() {
    this.cameras.main.setBackgroundColor('#182337');

    this.physics.world.setBounds(
      ARENA.left,
      ARENA.top,
      ARENA.right - ARENA.left,
      ARENA.bottom - ARENA.top
    );

    this.add.rectangle(
      480, 305, 900, 470, 0x202d42
    ).setStrokeStyle(3, 0x526b86);

    this.add.text(480, 30, 'EIHS DEFENSE', {
      fontSize: '28px',
      color: '#f5c451',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    // =========================================
    // ANIMATIONS
    // =========================================

    Object.entries(WALK_ART).forEach(([direction, asset]) => {
      this.anims.create({
        key: `walk-${direction}`,
        frames: this.anims.generateFrameNumbers(
          asset.texture,
          { start: 0, end: 7 }
        ),
        frameRate: 8,
        repeat: -1
      });
    });

    this.anims.create({
      key: 'engineer-attack',
      frames: this.anims.generateFrameNumbers(
        'engineer-attack',
        { start: 0, end: 7 }
      ),
      frameRate: SETTINGS.attackFPS,
      repeat: 0
    });

    this.anims.create({
      key: 'slime-move',
      frames: this.anims.generateFrameNumbers(
        'slime',
        { start: 0, end: 7 }
      ),
      frameRate: 8,
      repeat: -1
    });

    // =========================================
    // GAME STATE
    // =========================================

    this.hp = SETTINGS.playerMaxHP;
    this.kills = 0;
    this.gameOver = false;
    this.isAttacking = false;
    this.attackActive = false;
    this.elapsedMs = 0;
    this.spawnElapsedMs = 0;
    this.lastDamage = -1000;
    this.lastAttack = -SETTINGS.attackCooldown;
    this.facingAngle = Math.PI / 2;
    this.facingDirection = 'S';
    this.hitThisSwing = new Set();

    // =========================================
    // PLAYER
    // =========================================

    this.player = this.physics.add.sprite(
      480, 305, WALK_ART.S.texture, 0
    );

    this.player.setScale(0.55);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(65, 85);
    this.player.body.setOffset(95, 125);
    this.player.setDepth(5);

    // =========================================
    // ATTACK INDICATOR
    // =========================================

    this.attackIndicator = this.add.graphics();
    this.attackIndicator.setDepth(2);

    this.player.on('animationupdate', (animation, frame) => {
      if (
        this.gameOver ||
        !this.isAttacking ||
        animation.key !== 'engineer-attack'
      ) return;

      const frameIndex = frame.index - 1;

      this.attackActive =
        frameIndex >= SETTINGS.attackStartFrame &&
        frameIndex <= SETTINGS.attackEndFrame;

      if (!this.attackActive) {
        this.attackIndicator.clear();
      }
    });

    this.player.on('animationcomplete-engineer-attack', () => {
      if (this.gameOver) return;

      this.isAttacking = false;
      this.attackActive = false;
      this.attackIndicator.clear();
      this.player.setTexture(
        WALK_ART[this.facingDirection]?.texture ||
        WALK_ART.SW.texture,
        0
      );
    });

    // =========================================
    // CONTROLS
    // =========================================

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE');

    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT
    ]);

    this.input.on('pointerdown', pointer => {
      if (!this.gameOver) {
        this.attack(pointer.worldX, pointer.worldY);
      }
    });

    // =========================================
    // SLIMES & COLLISION
    // =========================================

    this.slimes = this.physics.add.group();

    this.physics.add.overlap(
      this.player,
      this.slimes,
      this.handlePlayerDamage,
      undefined,
      this
    );

    // =========================================
    // HUD
    // =========================================

    const hudStyle = {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace'
    };

    this.hpText = this.add.text(
      45, 555, 'HP: 100', hudStyle
    );

    this.killText = this.add.text(
      235, 555, 'Kills: 0',
      { ...hudStyle, color: '#f5c451' }
    );

    this.timerText = this.add.text(
      480, 555, 'Time: 90', hudStyle
    ).setOrigin(0.5, 0);

    this.waveText = this.add.text(
      760, 555, 'Threat: 1',
      { ...hudStyle, color: '#ffb36b' }
    );

    // =========================================
    // INITIAL SPAWNS & RESTART
    // =========================================

    for (let i = 0; i < 3; i++) {
      this.spawnSlime();
    }

    this.input.keyboard.on('keydown-R', () => {
      if (this.gameOver) this.scene.restart();
    });
  }

  // =========================================
  // SELECT DIRECTION FROM MOVEMENT
  // =========================================

  getMovementDirection(x, y) {
    if (x === 0 && y === 0) {
      return this.facingDirection;
    }

    if (x === 0 && y > 0) return 'S';
    if (x < 0 && y > 0) return 'SW';

    // Temporary fallback until the other
    // six directions have artwork.
    return 'SW';
  }

  // =========================================
  // DIFFICULTY
  // =========================================

  getProgress() {
    return Phaser.Math.Clamp(
      this.elapsedMs / (SETTINGS.duration * 1000),
      0, 1
    );
  }

  getSpawnInterval() {
    return Phaser.Math.Linear(
      SETTINGS.slimeStartSpawnMs,
      SETTINGS.slimeEndSpawnMs,
      this.getProgress()
    );
  }

  getSlimeSpeed() {
    return Phaser.Math.Linear(
      SETTINGS.slimeStartSpeed,
      SETTINGS.slimeEndSpeed,
      this.getProgress()
    );
  }

  getThreatLevel() {
    return Math.min(
      5,
      Math.floor(this.elapsedMs / 18000) + 1
    );
  }

  // =========================================
  // SPAWN SLIME
  // =========================================

  spawnSlime() {
    if (this.gameOver) return;

    if (
      this.slimes.countActive(true) >=
      SETTINGS.maxSlimes
    ) return;

    const side = Phaser.Math.Between(0, 3);
    let x, y;

    switch (side) {
      case 0:
        x = Phaser.Math.Between(55, 905);
        y = 90;
        break;
      case 1:
        x = Phaser.Math.Between(55, 905);
        y = 520;
        break;
      case 2:
        x = 55;
        y = Phaser.Math.Between(90, 520);
        break;
      default:
        x = 905;
        y = Phaser.Math.Between(90, 520);
    }

    const slime = this.slimes.create(x, y, 'slime');

    slime.setScale(1.3);
    slime.body.setSize(34, 26);
    slime.body.setOffset(11, 19);
    slime.setCollideWorldBounds(true);
    slime.setData('hp', SETTINGS.slimeHP);
    slime.setData('knockbackUntil', 0);
    slime.setData('defeated', false);
    slime.play('slime-move');
  }

  // =========================================
  // SWORD ATTACK
  // =========================================

  attack(targetX, targetY) {
    if (this.gameOver || this.isAttacking) return;

    const now = this.time.now;

    if (now - this.lastAttack < SETTINGS.attackCooldown) {
      return;
    }

    this.lastAttack = now;
    this.isAttacking = true;
    this.attackActive = false;
    this.hitThisSwing.clear();

    this.facingAngle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      targetX,
      targetY
    );

    this.player.play('engineer-attack');
  }

  drawAttackIndicator() {
    this.attackIndicator.clear();
    this.attackIndicator.fillStyle(0xf5c451, 0.12);
    this.attackIndicator.lineStyle(3, 0xf5c451, 0.7);

    this.attackIndicator.fillCircle(
      this.player.x,
      this.player.y,
      SETTINGS.attackRange
    );

    this.attackIndicator.strokeCircle(
      this.player.x,
      this.player.y,
      SETTINGS.attackRange
    );
  }

  checkSwordHits() {
    if (this.gameOver || !this.attackActive) return;

    this.slimes.children.iterate(slime => {
      if (!slime?.active || slime.getData('defeated')) return;
      if (this.hitThisSwing.has(slime)) return;

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        slime.x,
        slime.y
      );

      if (distance <= SETTINGS.attackRange) {
        this.hitThisSwing.add(slime);

        const angle = Phaser.Math.Angle.Between(
          this.player.x,
          this.player.y,
          slime.x,
          slime.y
        );

        this.hitSlime(slime, angle);
      }
    });
  }

  hitSlime(slime, angle) {
    if (!slime.active || slime.getData('defeated')) return;

    const hp = slime.getData('hp') - 1;
    slime.setData('hp', hp);
    slime.setTint(0xff5555);

    if (hp <= 0) {
      slime.setData('defeated', true);
      this.kills++;
      this.killText.setText(`Kills: ${this.kills}`);
      slime.body.enable = false;
      slime.anims.stop();

      this.tweens.add({
        targets: slime,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 180,
        onComplete: () => slime.destroy()
      });

      return;
    }

    slime.body.setVelocity(
      Math.cos(angle) * SETTINGS.knockbackSpeed,
      Math.sin(angle) * SETTINGS.knockbackSpeed
    );

    slime.setData(
      'knockbackUntil',
      this.time.now + SETTINGS.knockbackDuration
    );

    this.time.delayedCall(150, () => {
      if (slime.active) slime.clearTint();
    });
  }

  // =========================================
  // PLAYER DAMAGE
  // =========================================

  handlePlayerDamage(player, slime) {
    if (this.gameOver || slime.getData('defeated')) return;

    const now = this.time.now;

    if (
      now - this.lastDamage <
      SETTINGS.damageInvulnerability
    ) return;

    this.lastDamage = now;
    this.hp = Math.max(0, this.hp - SETTINGS.contactDamage);
    this.hpText.setText(`HP: ${this.hp}`);

    player.setTint(0xff5555);

    this.time.delayedCall(180, () => {
      if (player.active) player.clearTint();
    });

    if (this.hp <= 0) this.finishGame(false);
  }

  // =========================================
  // FINISH GAME
  // =========================================

  finishGame(victory) {
    if (this.gameOver) return;

    this.gameOver = true;
    this.isAttacking = false;
    this.attackActive = false;
    this.attackIndicator.clear();

    this.player.body.setVelocity(0, 0);
    this.player.anims.stop();

    this.slimes.children.iterate(slime => {
      if (!slime?.active) return;
      slime.body.setVelocity(0, 0);
      slime.anims.stop();
    });

    const survived = Math.min(
      SETTINGS.duration,
      this.elapsedMs / 1000
    );

    const score =
      this.kills * 100 +
      Math.floor(survived * 10) +
      (victory ? 1000 : 0);

    this.add.rectangle(
      WIDTH / 2, HEIGHT / 2,
      WIDTH, HEIGHT,
      0x08101f, 0.78
    ).setDepth(100);

    this.add.rectangle(
      480, 300, 490, 320,
      0x142238, 0.98
    ).setStrokeStyle(3, 0xf5c451).setDepth(101);

    this.add.text(
      480, 190,
      victory ? 'VICTORY!' : 'GAME OVER',
      {
        fontSize: '38px',
        color: victory ? '#7ee39b' : '#ff7777',
        fontFamily: 'monospace'
      }
    ).setOrigin(0.5).setDepth(102);

    this.add.text(
      480, 275,
      [
        `Slimes defeated: ${this.kills}`,
        `Survival time: ${survived.toFixed(1)}s`,
        `Final score: ${score}`
      ].join('\n'),
      {
        fontSize: '21px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 12
      }
    ).setOrigin(0.5).setDepth(102);

    const button = this.add.rectangle(
      480, 385, 210, 48, 0x315b7d
    )
      .setStrokeStyle(2, 0x91c9ef)
      .setInteractive({ useHandCursor: true })
      .setDepth(102);

    this.add.text(
      480, 385, 'PLAY AGAIN',
      {
        fontSize: '21px',
        color: '#ffffff',
        fontFamily: 'monospace'
      }
    ).setOrigin(0.5).setDepth(103);

    button.on('pointerover', () => {
      button.setFillStyle(0x417ca6);
    });

    button.on('pointerout', () => {
      button.setFillStyle(0x315b7d);
    });

    button.on('pointerdown', () => this.scene.restart());

    this.add.text(
      480, 440, 'Press R to restart',
      {
        fontSize: '15px',
        color: '#a8bed1',
        fontFamily: 'monospace'
      }
    ).setOrigin(0.5).setDepth(102);
  }

  // =========================================
  // MAIN UPDATE LOOP
  // =========================================

  update(time, delta) {
    if (this.gameOver) return;

    // Survival timer
    this.elapsedMs = Math.min(
      SETTINGS.duration * 1000,
      this.elapsedMs + delta
    );

    const remaining = Math.max(
      0,
      Math.ceil(SETTINGS.duration - this.elapsedMs / 1000)
    );

    this.timerText.setText(`Time: ${remaining}`);
    this.waveText.setText(`Threat: ${this.getThreatLevel()}`);

    if (this.elapsedMs >= SETTINGS.duration * 1000) {
      this.finishGame(true);
      return;
    }

    // Dynamic slime spawning
    this.spawnElapsedMs += delta;
    const interval = this.getSpawnInterval();

    let spawned = 0;

    while (
      this.spawnElapsedMs >= interval &&
      spawned < 3
    ) {
      this.spawnElapsedMs -= interval;
      this.spawnSlime();
      spawned++;
    }

    // Movement input
    let x = 0;
    let y = 0;

    if (this.keys.A.isDown || this.cursors.left.isDown) x--;
    if (this.keys.D.isDown || this.cursors.right.isDown) x++;
    if (this.keys.W.isDown || this.cursors.up.isDown) y--;
    if (this.keys.S.isDown || this.cursors.down.isDown) y++;

    const direction = new Phaser.Math.Vector2(x, y).normalize();

    this.player.body.setVelocity(
      direction.x * SETTINGS.playerSpeed,
      direction.y * SETTINGS.playerSpeed
    );

    // Directional walking animation
    if (!this.isAttacking) {
      if (x !== 0 || y !== 0) {
        this.facingDirection =
          this.getMovementDirection(x, y);

        const animationKey =
          `walk-${this.facingDirection}`;

        if (this.anims.exists(animationKey)) {
          this.player.anims.play(animationKey, true);
        } else {
          this.player.anims.play('walk-SW', true);
        }
      } else {
        this.player.anims.stop();

        const texture =
          WALK_ART[this.facingDirection]?.texture ||
          WALK_ART.SW.texture;

        this.player.setTexture(texture, 0);
      }
    }

    // Mouse aiming
    const pointer = this.input.activePointer;

    if (pointer.x >= 0 && pointer.y >= 0) {
      this.facingAngle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        pointer.worldX,
        pointer.worldY
      );
    }

    if (this.keys.SPACE.isDown) {
      this.attack(
        this.player.x + Math.cos(this.facingAngle) * 100,
        this.player.y + Math.sin(this.facingAngle) * 100
      );
    }

    // Active spinning sword hitbox
    if (this.attackActive) {
      this.drawAttackIndicator();
      this.checkSwordHits();
    }

    // Slime AI
    this.slimes.children.iterate(slime => {
      if (!slime?.active || slime.getData('defeated')) return;

      if (
        this.time.now <
        slime.getData('knockbackUntil')
      ) return;

      const angle = Phaser.Math.Angle.Between(
        slime.x,
        slime.y,
        this.player.x,
        this.player.y
      );

      const speed = this.getSlimeSpeed();

      slime.body.setVelocity(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );
    });
  }
}

// =========================================
// PHASER CONFIGURATION
// =========================================

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#182337',
  pixelArt: true,

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },

  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },

  scene: DefenseScene
};

new Phaser.Game(config);
