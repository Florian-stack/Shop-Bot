import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import sqlite from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { ComponentType } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import config from './config.js';





// ██████╗  ██████╗ ████████╗ ██████╗ 
// ██╔══██╗██╔═══██╗╚══██╔══╝██╔═══██╗
// ██║  ██║██║   ██║   ██║   ██║   ██║
// ██║  ██║██║   ██║   ██║   ██║   ██║
// ██████╔╝╚██████╔╝   ██║   ╚██████╔╝
// ╚═════╝  ╚═════╝    ╚═╝    ╚═════╝ 
// Datenbank Setup
const db = sqlite(path.join(process.cwd(), config.DATABASE.FILENAME));
db.pragma(config.DATABASE.PRAGMA);

// Tabellenstruktur
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    coins INTEGER DEFAULT 0
  )`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER,
    description TEXT,
    image_url TEXT,
    delivery_type TEXT CHECK(delivery_type IN ('FILE', 'KEY')),
    delivery_content TEXT
  )`).run();

// 🔄 Datenbank Updates
db.prepare(`
  CREATE TABLE IF NOT EXISTS pending_payments (
    payment_id TEXT PRIMARY KEY,
    user_id TEXT,
    product_id INTEGER,
    paysafecode TEXT,
    amount INTEGER,
    status TEXT DEFAULT 'pending',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT PRIMARY KEY,
    payment_log_channel TEXT
  )`).run();


db.prepare(`
  CREATE TABLE IF NOT EXISTS product_keys (
    key TEXT PRIMARY KEY,
    product_id INTEGER,
    user_id TEXT,
    used BOOLEAN DEFAULT 0,
    FOREIGN KEY(product_id) REFERENCES products(id)
  )`).run();

// NEUE TABELLEN ↓↓↓
db.prepare(`
  CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    discount_percent INTEGER,
    product_ids TEXT,
    expires_at DATETIME,
    max_uses INTEGER DEFAULT 1,
    uses INTEGER DEFAULT 0
  )`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS product_ratings (
    user_id TEXT,
    product_id INTEGER,
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    review TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id)
  )`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS wishlist (
    user_id TEXT,
    product_id INTEGER,
    PRIMARY KEY (user_id, product_id)
  )`).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS file_purchases (
      user_id TEXT,
      product_id INTEGER,
      purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, product_id)
    )`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS coupons (
        code TEXT PRIMARY KEY,
        discount_percent INTEGER CHECK(discount_percent BETWEEN 1 AND 100),
        product_ids TEXT DEFAULT 'all',
        expires_at DATETIME,
        max_uses INTEGER DEFAULT 1,
        uses INTEGER DEFAULT 0
      )`).run();
    
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_coupons (
        user_id TEXT,
        coupon_code TEXT,
        used BOOLEAN DEFAULT 0,
        PRIMARY KEY (user_id, coupon_code),
        FOREIGN KEY(coupon_code) REFERENCES coupons(code)
      )`).run();

// 🔧 Hilfsfunktionen
function generateProductKey(prefix = config.ECONOMY.KEY_PREFIX) {
  const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `${prefix}-${randomPart}`;
}

function generateCouponCode() {
  return crypto.randomBytes(config.ECONOMY.COUPON_LENGTH/2).toString('hex').toUpperCase();
}

// 🆕 NEUE LEADERBOARD-FUNKTION HIER EINFÜGEN
function getLeaderboard(limit = 10) {
  return db.prepare(`
    SELECT user_id, coins 
    FROM users 
    ORDER BY coins DESC 
    LIMIT ?
  `).all(limit);
}

// ██████╗ ██████╗  ██████╗ ████████╗
// ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
// ██║  ██║██████╔╝██║   ██║   ██║   
// ██║  ██║██╔══██╗██║   ██║   ██║   
// ██████╔╝██║  ██║╚██████╔╝   ██║   
// ╚═════╝ ╚═╝  ╚═╝ ╚═════╝    ╚═╝   
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🎮 Slash Commands
const commands = [
  // Basis-Commands
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Zeigt alle verfügbaren Produkte an'),
  
// In den Commands einfügen
new SlashCommandBuilder()
  .setName('redeem')
  .setDescription('Rabattcode einlösen')
  .addStringOption(option =>
    option.setName('code').setDescription('Coupon-Code').setRequired(true)),

    new SlashCommandBuilder()
    .setName('paywithpaysafe')
    .setDescription('Zahle mit Paysafecard')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('Dein 16-stelliger Paysafecode')
        .setRequired(true)
        .setMinLength(16)
        .setMaxLength(16))
    .addIntegerOption(option =>
      option.setName('product_id')
        .setDescription('Produkt-ID aus dem Shop')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('setpaymentchannel')
    .setDescription('Setze den Payment-Log Channel (Admin)')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel für Zahlungslogs')
        .setRequired(true)),


// Balance Command
new SlashCommandBuilder()
.setName('balance')
.setDescription('Zeige deine Coins an')
.addUserOption(option =>
  option.setName('user')
    .setDescription('Anderer Benutzer')),

// Leaderboard Command
new SlashCommandBuilder()
 .setName('leaderboard')
 .setDescription('Zeigt die Top 10 der reichsten User')
 .addBooleanOption(option =>
  option.setName('global')
    .setDescription('Globales Leaderboard anzeigen? (Admin-only)')
),


// Giveaway Command
new SlashCommandBuilder()
.setName('giveaway')
.setDescription('Starte ein Giveaway')
.addIntegerOption(option =>
  option.setName('duration').setDescription('Dauer in Minuten').setRequired(true))
.addIntegerOption(option =>
  option.setName('coins').setDescription('Coin-Menge').setRequired(true))
.addIntegerOption(option =>
  option.setName('winners').setDescription('Anzahl Gewinner').setRequired(true)),

  // Admin-Commands
  new SlashCommandBuilder()
    .setName('createproduct')
    .setDescription('Erstellt ein neues Produkt (Admin)')
    .addStringOption(option =>
      option.setName('name').setDescription('Produktname').setRequired(true))
    .addIntegerOption(option =>
      option.setName('price').setDescription('Preis in Coins').setRequired(true))
    .addStringOption(option =>
      option.setName('description').setDescription('Produktbeschreibung').setRequired(true))
    .addStringOption(option =>
      option.setName('image').setDescription('Bild-URL').setRequired(true))
    .addStringOption(option =>
      option.setName('delivery_type').setDescription('Lieferart')
        .addChoices({ name: 'Datei', value: 'FILE' }, { name: 'Key', value: 'KEY' })
        .setRequired(true))
    .addStringOption(option =>
      option.setName('delivery_content').setDescription('Datei-URL/Key-Präfix').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('addcoins')
    .setDescription('Fügt Coins hinzu (Admin)')
    .addUserOption(option =>
      option.setName('user').setDescription('Benutzer').setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount').setDescription('Menge').setRequired(true)),
  
  // CORRECTED CreateCoupon Command
  new SlashCommandBuilder()
    .setName('createcoupon')
    .setDescription('Erstellt Rabattcode (Admin)')
    .addIntegerOption(option =>
      option.setName('discount').setDescription('Rabatt in %').setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration').setDescription('Gültigkeit in Stunden').setRequired(true))
    .addIntegerOption(option =>
      option.setName('uses').setDescription('Max. Verwendungen').setRequired(true))
    .addStringOption(option =>
      option.setName('products').setDescription('Kommagetrennte IDs (leer=alle)')),
  
  
  new SlashCommandBuilder()
    .setName('rateproduct')
    .setDescription('Bewerte ein Produkt')
    .addIntegerOption(option =>
      option.setName('product_id').setDescription('Produkt-ID').setRequired(true))
    .addIntegerOption(option =>
      option.setName('rating').setDescription('1-5 Sterne').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(option =>
      option.setName('review').setDescription('Bewertungstext')),
  
  new SlashCommandBuilder()
    .setName('wishlist')
    .setDescription('Wunschliste verwalten')
    .addSubcommand(sub =>
      sub.setName('show').setDescription('Zeige deine Wunschliste'))
    .addSubcommand(sub =>
      sub.setName('add').setDescription('Produkt hinzufügen')
        .addIntegerOption(option =>
          option.setName('product_id').setDescription('Produkt-ID').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove').setDescription('Produkt entfernen')
        .addIntegerOption(option =>
          option.setName('product_id').setDescription('Produkt-ID').setRequired(true)))
].map(command => command.toJSON());

// ⚙️ Event Handler
client.on('ready', async () => {
  console.log(`✅ Bot eingeloggt als ${client.user.tag}`);
  await client.application.commands.set(commands);
});

// 🛍️ SHOP COMMAND MIT FUNKTIONIERENDEM SELECT MENU
client.on('interactionCreate', async interaction => {
  if (interaction.commandName !== 'shop') return;

  // Produkte aus der Datenbank holen
  const products = db.prepare(`
    SELECT p.*, 
      AVG(r.rating) as avg_rating,
      COUNT(r.rating) as total_ratings
    FROM products p
    LEFT JOIN product_ratings r ON p.id = r.product_id
    GROUP BY p.id
  `).all();

  if (products.length === 0) {
    return interaction.reply({ 
      content: '⚠️ Der Shop ist aktuell leer!', 
      ephemeral: true 
    });
  }

  // Select Menu erstellen
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('shop_select')
    .setPlaceholder('Wähle ein Produkt aus...')
    .addOptions(
      products.map(product => ({
        label: product.name.substring(0, 25),
        description: `${product.price} Coins | ${product.description.substring(0, 50)}...`,
        value: product.id.toString()
      }))
    );

  // Action Row mit dem Select Menu
  const actionRow = new ActionRowBuilder().addComponents(selectMenu);


  // Initiales Embed
  const embed = new EmbedBuilder()
    .setTitle('🎮 Game Shop')
    .setDescription('Wähle ein Produkt aus dem Menü für mehr Details')
    .setColor(config.EMBEDS.DEFAULT_COLOR)
    .setImage(config.EMBEDS.SHOP_BANNER)


    await interaction.reply({ 
      embeds: [embed], 
      components: [actionRow]  // ✅ Correct variable name
    });
});

// 🔧 ADMIN: ADD COINS
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'addcoins') {
    // Berechtigung prüfen
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '🔒 Admin-Berechtigung benötigt!', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    // Coins aktualisieren
    db.prepare(`
      INSERT INTO users (user_id, coins)
      VALUES (?, COALESCE((SELECT coins FROM users WHERE user_id = ?), 0) + ?)
      ON CONFLICT(user_id) DO UPDATE SET coins = excluded.coins
    `).run(user.id, user.id, amount);

    // Bestätigung senden
    const embed = new EmbedBuilder()
      .setTitle('✅ Coins hinzugefügt')
      .setDescription(`${user.tag} hat ${amount} Coins erhalten!`)
      .addFields({
        name: 'Neuer Kontostand',
        value: `${db.prepare('SELECT coins FROM users WHERE user_id = ?').get(user.id)?.coins || 0} Coins`
      })
      .setColor(config.EMBEDS.DEFAULT_COLOR)

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'setpaymentchannel') {
    // Berechtigung prüfen
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ 
        content: '🔒 Admin-Berechtigung benötigt!', 
        ephemeral: true 
      });
    }

    const channel = interaction.options.getChannel('channel');
    
    // Channel-Typ validieren
    if (!channel.isTextBased()) {
      return interaction.reply({
        content: '❌ Der Channel muss ein Text-Channel sein!',
        ephemeral: true
      });
    }

    try {
      // In Datenbank speichern
      db.prepare(`
        INSERT INTO config (guild_id, payment_log_channel)
        VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          payment_log_channel = excluded.payment_log_channel
      `).run(interaction.guildId, channel.id);

      // Erfolgsmeldung
      const embed = new EmbedBuilder()
        .setTitle('✅ Payment-Channel gesetzt')
        .setDescription(`Zahlungs-Logs werden jetzt in ${channel} gespeichert`)
        .addFields({
          name: 'Channel-ID',
          value: channel.id,
          inline: true
        })
        .setColor(config.EMBEDS.DEFAULT_COLOR)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      console.error('Fehler beim Setzen des Payment-Channels:', error);
      await interaction.reply({
        content: '❌ Ein Fehler ist beim Speichern aufgetreten!',
        ephemeral: true
      });
    }
  }
});

// 🖼️ KORRIGIERTER PRODUCT DETAIL HANDLER
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'shop_select') return;

  // Immediately acknowledge the interaction
  try {
    await interaction.deferUpdate();
  } catch (error) {
    console.error('Defer failed:', error);
    return;
  }

  try {
    const productId = parseInt(interaction.values[0]); // Klammer korrigiert
    if (isNaN(productId)) { // Klammer korrigiert
      console.error('Ungültige Produkt-ID:', interaction.values[0]);
      return interaction.followUp({
        content: '❌ Ungültige Produktauswahl!',
        ephemeral: true
      });
    }


    const product = db.prepare(`
      SELECT p.*, 
        AVG(r.rating) as avg_rating,
        COUNT(r.rating) as total_ratings
      FROM products p
      LEFT JOIN product_ratings r ON p.id = r.product_id
      WHERE p.id = ?
    `).get(productId);

    if (!product) {
      return await interaction.followUp({
        content: '❌ Product not found!',
        flags: MessageFlags.Ephemeral
      });
    }


    if (!interaction.message || interaction.message.deleted) {
      return interaction.followUp({
        content: '⚠️ Bitte shop-Befehl neu ausführen!',
        ephemeral: true
      });
    }

    const ratingStars = product.avg_rating 
      ? '★'.repeat(Math.round(product.avg_rating)).padEnd(5, '☆')
      : '☆☆☆☆☆';

    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${product.name}`)
      .setDescription(product.description)
      .setColor(config.EMBEDS.DEFAULT_COLOR)
      .setImage(product.image_url)
      .addFields(
        { name: 'Preis', value: `**${product.price} Coins**`, inline: true },
        { name: 'Lieferart', value: product.delivery_type === 'FILE' ? '📁 Sofortdownload' : '🔑 Aktivierungscode', inline: true },
        { name: 'Bewertungen', value: `${ratingStars} (${product.total_ratings})`, inline: true },
        { name: 'Produkt-ID', value: `#${product.id}`, inline: true }
      );

      const buyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`buy_${product.id}`)
          .setLabel('Jetzt kaufen')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`paysafe_${product.id}`)
          .setLabel('Mit Paysafe zahlen')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('💳')
      );
  
      await interaction.message.edit({
        embeds: [embed],
        components: [buyRow] // ✅ Korrekte ActionRow
      });
    
  } catch (error) {
    console.error('Fehler bei Produktauswahl:', error);
    await interaction.followUp({
      content: '❌ Fehler beim Laden des Produkts!',
      flags: MessageFlags.Ephemeral
    });
  }
});


// 💳 PAYSAFE BUTTON HANDLER (Öffnet das Modal)
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('paysafe_')) return;

  try {
    const productId = interaction.customId.split('_')[1];
    
    // Produkt validieren
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) {
      return interaction.reply({ 
        content: '❌ Ungültiges Produkt!', 
        ephemeral: true 
      });
    }

    // Modal erstellen
    const modal = new ModalBuilder()
      .setCustomId(`paysafeModal_${productId}`)
      .setTitle(`Zahlung für ${product.name}`);

    const codeInput = new TextInputBuilder()
      .setCustomId('paysafeCode')
      .setLabel("16-stelliger Paysafecode")
      .setStyle(TextInputStyle.Short)
      .setMinLength(16)
      .setMaxLength(16)
      .setRequired(true)
      .setPlaceholder('XXXX-XXXX-XXXX-XXXX');

    const actionRow = new ActionRowBuilder().addComponents(codeInput);
    modal.addComponents(actionRow);

    // Direktes Anzeigen des Modals OHNE deferReply
    await interaction.showModal(modal);
    
  } catch (error) {
    console.error('Fehler beim Öffnen des Modals:', error);
    
    // Fallback-Antwort falls Modal nicht mehr gezeigt werden kann
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Fehler beim Öffnen des Zahlungsformulars!',
        ephemeral: true
      });
    }
  }
});

// ✅ PAYSAFE MODAL SUBMIT HANDLER (Verarbeitung)
client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('paysafeModal_')) return;

  await interaction.deferReply({ ephemeral: true });
  const productId = interaction.customId.split('_')[1];
  const code = interaction.fields.getTextInputValue('paysafeCode');

  try {
    // Validierung des Produkts
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) return interaction.editReply('❌ Produkt nicht gefunden!');

    // Code-Validierung
    if (!/^\d{16}$/.test(code.replace(/\s/g, ''))) {
      return interaction.editReply('❌ Ungültiger Paysafecode! Muss 16 Ziffern enthalten.');
    }

    // Payment-ID generieren
    const paymentId = crypto.randomBytes(8).toString('hex').toUpperCase();

    // Payment in DB speichern
    db.prepare(`
      INSERT INTO pending_payments 
      (payment_id, user_id, product_id, paysafecode, amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(paymentId, interaction.user.id, productId, code, product.price);

    // Log-Channel finden
    const config = db.prepare('SELECT payment_log_channel FROM config WHERE guild_id = ?')
      .get(interaction.guildId);
    
    if (!config?.payment_log_channel) {
      return interaction.editReply('❌ Payment-System nicht konfiguriert!');
    }

    const channel = interaction.guild.channels.cache.get(config.CHANNELS.PAYMENT_LOGS);
    if (!channel?.isTextBased()) {
      return interaction.editReply('❌ Log-Channel nicht gefunden!');
    }

    // Admin-Embed erstellen
    const logEmbed = new EmbedBuilder()
      .setTitle('💳 Neue Paysafecard-Zahlung')
      .setColor(config.EMBEDS.DEFAULT_COLOR)
      .addFields(
        { name: 'Payment-ID', value: paymentId },
        { name: 'Benutzer', value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: 'Produkt', value: `${product.name} (#${productId})` },
        { name: 'Betrag', value: `${product.price} Coins` },
        { name: 'Paysafecode', value: `||${code}||` }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    // Admin-Buttons
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`payment_approve_${paymentId}`)
        .setLabel('Bestätigen')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`payment_deny_${paymentId}`)
        .setLabel('Ablehnen')
        .setStyle(ButtonStyle.Danger)
    );

    // Log senden
    await channel.send({ 
      content: `<@&${config.ROLES.ADMIN}>`,
      embeds: [logEmbed], 
      components: [buttons] 
    });

    // Bestätigung an User
    await interaction.editReply({
      content: '✅ Zahlung erfolgreich eingereicht! Ein Admin wird sie bald überprüfen.',
    });

  } catch (error) {
    console.error('Fehler bei Paysafe-Zahlung:', error);
    await interaction.editReply({
      content: '❌ Ein Fehler ist bei der Zahlungsverarbeitung aufgetreten!',
    });
  }
});

// 💳 PAYSAFE PAYMENT HANDLING
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'paywithpaysafe') {
    await interaction.deferReply({ ephemeral: true });
    
    const code = interaction.options.getString('code');
    const productId = interaction.options.getInteger('product_id');
    
    // Produkt validieren
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) return interaction.editReply('❌ Ungültiges Produkt!');

    // Payment-ID generieren
    const paymentId = crypto.randomBytes(8).toString('hex').toUpperCase();

    // Payment in DB speichern
    db.prepare(`
      INSERT INTO pending_payments 
      (payment_id, user_id, product_id, paysafecode, amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(paymentId, interaction.user.id, productId, code, product.price);

    // Log-Channel finden
    const config = db.prepare('SELECT payment_log_channel FROM config WHERE guild_id = ?')
      .get(interaction.guildId);
    if (!config?.payment_log_channel) {
      return interaction.editReply('❌ Payment-System nicht konfiguriert!');
    }

    const channel = interaction.guild.channels.cache.get(config.CHANNELS.PAYMENT_LOGS);
    if (!channel) {
      return interaction.editReply('❌ Log-Channel nicht gefunden!');
    }

    // Admin-Embed erstellen
    const logEmbed = new EmbedBuilder()
      .setTitle('💳 Neue Paysafecard-Zahlung')
      .setColor(config.EMBEDS.DEFAULT_COLOR)
      .addFields(
        { name: 'Payment-ID', value: paymentId },
        { name: 'Benutzer', value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: 'Produkt', value: `${product.name} (#${productId})` },
        { name: 'Betrag', value: `${product.price} Coins` },
        { name: 'Paysafecode', value: `||${code}||` }
      )
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`payment_approve_${paymentId}`)
        .setLabel('Bestätigen')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`payment_deny_${paymentId}`)
        .setLabel('Ablehnen')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [logEmbed], components: [buttons] });
    await interaction.editReply('✅ Zahlung eingereicht! Ein Admin wird diese bald überprüfen.');
  }
});



client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('payment_')) return;
  
  const [action, paymentId] = interaction.customId.split('_').slice(1);
  if (!['approve', 'deny'].includes(action)) return;

  if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin-Berechtigung benötigt!', ephemeral: true });
  }

  const payment = db.prepare(`SELECT * FROM pending_payments WHERE payment_id = ? AND status = 'pending'`).get(paymentId);
  if (!payment) {
      return interaction.reply({ content: '❌ Zahlung nicht gefunden oder bereits bearbeitet!', ephemeral: true });
  }

  try {
      db.prepare(`UPDATE pending_payments SET status = ? WHERE payment_id = ?`).run('approved', paymentId);
      
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(payment.product_id);
      if (!product) throw new Error('PRODUCT_NOT_FOUND');

      const user = await client.users.fetch(payment.user_id);
      if (!user) throw new Error('USER_NOT_FOUND');

      const paymentUpdate = db
  .prepare(`UPDATE pending_payments SET status = ? WHERE payment_id = ?`)
  .run('approved', paymentId);


  if (product.delivery_type === 'KEY') {
    const key = db.prepare(`
      SELECT key FROM product_keys 
      WHERE product_id = ? AND used = 0 
      LIMIT 1
    `).get(product.id);

    if (!key) {
      throw new Error('KEYS_EXHAUSTED');
    }

    db.prepare(`
      UPDATE product_keys 
      SET used = 1, user_id = ? 
      WHERE key = ?
    `).run(payment.user_id, key.key);

} else if (product.delivery_type === 'FILE') {
    db.prepare(`
      INSERT INTO file_purchases (user_id, product_id) 
      VALUES (?, ?)
    `).run(payment.user_id, product.id);
}



      let components = [];
      let description = product.description;

      if (product.delivery_type === 'KEY') {
          const key = db.prepare(`SELECT key FROM product_keys WHERE product_id = ? AND used = 0 LIMIT 1`).get(product.id);
          if (!key) throw new Error('KEYS_EXHAUSTED');

          db.prepare(`UPDATE product_keys SET used = 1, user_id = ? WHERE key = ?`).run(user.id, key.key);

          components.push(new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                  .setCustomId(`revealKey_${product.id}`)
                  .setLabel('Key anzeigen')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🔑')
          ));
      } else if (product.delivery_type === 'FILE') {
          components.push(new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                  .setLabel('Jetzt downloaden')
                  .setURL(product.delivery_content)
                  .setStyle(ButtonStyle.Link)
          ));
      }

      const deliveryEmbed = new EmbedBuilder()
          .setTitle(`🎁 ${product.name} - Kaufbestätigung`)
          .setDescription(description)
          .addFields(
              { name: 'Bestellnummer', value: `#${crypto.randomBytes(4).toString('hex').toUpperCase()}`, inline: true },
              { name: 'Lieferart', value: product.delivery_type === 'KEY' ? '🔑 Digitaler Key' : '📁 Direktdownload', inline: true }
          )
          .setColor(config.EMBEDS.DEFAULT_COLOR)
          .setThumbnail(product.image_url)
          .setFooter({ text: 'Die Lieferung erfolgt ausschließlich per DM' });

      await user.send({ embeds: [deliveryEmbed], components: components });

      await interaction.update({ content: '✅ Zahlung erfolgreich bestätigt', components: [] });
  } catch (error) {
      console.error('Transaktionsfehler:', error);
      
      const errorMessages = {
          'PRODUCT_NOT_FOUND': '❌ Produkt existiert nicht',
          'USER_NOT_FOUND': '❌ Benutzer nicht gefunden',
          'KEYS_EXHAUSTED': '❌ Keine Keys verfügbar',
          'DM_DELIVERY_FAILED': '❌ Zustellung per DM fehlgeschlagen'
      };
      
      await interaction.reply({
          content: errorMessages[error.message] || '❌ Unbekannter Fehler',
          ephemeral: true
      });
  }
});


client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'leaderboard') {
    const isGlobal = interaction.options.getBoolean('global') || false;
    
    // Berechtigungsprüfung für globales Leaderboard
    if (isGlobal && !interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '🔐 Globales Leaderboard erfordert Admin-Rechte!', ephemeral: true });
    }

    const users = getLeaderboard(10, !isGlobal, interaction.guildId);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${isGlobal ? 'Globales' : 'Server'} Leaderboard`)
      .setColor(config.EMBEDS.DEFAULT_COLOR)
      .setThumbnail(config.EMBEDS.LEADERBOARD_THUMB)
      .setFooter({ text: `Stand: ${new Date().toLocaleString('de-DE')}` });

    if (users.length === 0) {
      embed.setDescription('❌ Keine Daten verfügbar');
      return interaction.reply({ embeds: [embed] });
    }

    // Platzierungen mit Emojis
    const podiumEmojis = ['🥇', '🥈', '🥉'];
    
    for (let i = 0; i < users.length; i++) {
      const user = await client.users.fetch(users[i].user_id).catch(() => null);
      const coins = users[i].coins.toLocaleString('de-DE');
      
      embed.addFields({
        name: `${i < 3 ? podiumEmojis[i] : `#${i + 1}`} ${user?.username || 'Unbekannter User'}`,
        value: `**${coins}** Coins`,
        inline: false
      });
    }

    // Zusatzinfo für aktuellen User
    const userRank = db.prepare(`
      SELECT COUNT(*) as rank 
      FROM users 
      WHERE coins > (SELECT coins FROM users WHERE user_id = ?)
    `).get(interaction.user.id)?.rank + 1;

    embed.addFields({
      name: 'Dein Rang',
      value: userRank 
        ? `Platz #${userRank} mit ${db.prepare('SELECT coins FROM users WHERE user_id = ?').get(interaction.user.id)?.coins || 0} Coins`
        : 'Nicht in der Top 100',
      inline: false
    });

    await interaction.reply({ embeds: [embed] });
  }
});



client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'redeem') {
    const code = interaction.options.getString('code');
    
    // Coupon Validierung
    const coupon = db.prepare(`
      SELECT * FROM coupons 
      WHERE code = ? 
        AND (expires_at > CURRENT_TIMESTAMP)
        AND (uses < max_uses)
    `).get(code);

    if (!coupon) return interaction.reply('❌ Ungültiger Coupon');
    
    // Coupon dem User zuweisen
    db.prepare(`
      INSERT INTO user_coupons (user_id, coupon_code)
      VALUES (?, ?)
      ON CONFLICT DO NOTHING
    `).run(interaction.user.id, code);

    // Globalen Nutzungszähler erhöhen
    db.prepare(`UPDATE coupons SET uses = uses + 1 WHERE code = ?`).run(code);
    
    interaction.reply(`✅ Coupon aktiviert!`);
  }
});

db.prepare(`
  CREATE TABLE IF NOT EXISTS daily_rewards (
    user_id TEXT PRIMARY KEY,
    last_claim DATETIME
  )`).run();

  client.on('interactionCreate', async interaction => {
    if (interaction.commandName === 'daily') {
      const result = db.prepare(`
        INSERT INTO daily_rewards (user_id, last_claim)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          last_claim = CASE WHEN strftime('%s','now') - strftime('%s',last_claim) >= 86400
                          THEN strftime('%s','now') ELSE last_claim END
        RETURNING strftime('%s','now') - strftime('%s',last_claim) as diff
      `).get(interaction.user.id, Math.floor(Date.now()/1000));
  
      if (result.diff < 86400) {
        return interaction.reply('❌ Bereits abgeholt!');
      }
  
      db.prepare(`
        UPDATE users SET coins = coins + ?
        WHERE user_id = ?
      `).run(config.ECONOMY.DAILY_COINS, interaction.user.id);
      
      interaction.reply('✅ 100 Coins erhalten!');
    }
  });




// ❤️ WISHLIST BUTTON HANDLER
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('wishlist_')) return;
  
  await interaction.deferReply({ ephemeral: true });
  const productId = interaction.customId.split('_')[1];

  // Prüfe ob Produkt existiert
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return interaction.editReply('❌ Produkt nicht gefunden!');

  // Wunschlisten-Status ermitteln
  const inWishlist = db.prepare(`
    SELECT 1 FROM wishlist 
    WHERE user_id = ? AND product_id = ?
  `).get(interaction.user.id, productId);

  if (inWishlist) {
    // Entfernen aus Wunschliste
    db.prepare(`
      DELETE FROM wishlist 
      WHERE user_id = ? AND product_id = ?
    `).run(interaction.user.id, productId);
    interaction.editReply('❌ Produkt aus Wunschliste entfernt');
  } else {
    // Hinzufügen zur Wunschliste
    db.prepare(`
      INSERT INTO wishlist (user_id, product_id)
      VALUES (?, ?)
    `).run(interaction.user.id, productId);
    interaction.editReply('✅ Produkt zur Wunschliste hinzugefügt');
  }

  // Update den Shop-Embed Button
  const wishlistButton = new ButtonBuilder()
    .setCustomId(`wishlist_${productId}`)
    .setLabel(inWishlist ? 'Zur Wunschliste' : 'In Wunschliste')
    .setStyle(inWishlist ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setEmoji(inWishlist ? '❤️' : '🤍');

  const row = new ActionRowBuilder().addComponents(
    interaction.message.components[0].components[0], // Behalte Kauf-Button
    wishlistButton
  );

  await interaction.message.edit({
    components: [row]
  });
});



  

// 🛒 BUY BUTTON HANDLER (MIT COUPON-SYSTEM)
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('buy_')) return;
  
  await interaction.deferReply({ ephemeral: true });
  const productId = interaction.customId.split('_')[1];
  
  try {
    // 1. Produktdaten abrufen
    const product = db.prepare(`
      SELECT *, 
        (SELECT GROUP_CONCAT(code) 
         FROM user_coupons uc 
         JOIN coupons c ON uc.coupon_code = c.code
         WHERE uc.user_id = ?
           AND uc.used = 0
           AND (c.product_ids = 'all' OR instr(','||c.product_ids||',', ','||products.id||','))
        ) as active_coupons
      FROM products 
      WHERE id = ?
    `).get(interaction.user.id, productId);

    if (!product) {
      return interaction.editReply('⚠️ Produkt nicht gefunden!');
    }

    // 2. Coupon-Logik
    let finalPrice = product.price;
    let usedCoupon = null;
    
    if (product.active_coupons) {
      const couponCode = product.active_coupons.split(',')[0];
      usedCoupon = db.prepare(`
        SELECT * FROM coupons 
        WHERE code = ? 
          AND expires_at > CURRENT_TIMESTAMP
          AND uses < max_uses
      `).get(couponCode);

      if (usedCoupon) {
        // Preis berechnen
        const discount = product.price * (usedCoupon.discount_percent / 100);
        finalPrice = Math.max(0, product.price - discount);
        
        // Coupon als verwendet markieren
        db.prepare(`
          UPDATE user_coupons 
          SET used = 1 
          WHERE user_id = ? AND coupon_code = ?
        `).run(interaction.user.id, usedCoupon.code);
      }
    }

    // 3. Kontostand prüfen
    const userData = db.prepare(`
      SELECT coins FROM users 
      WHERE user_id = ?
    `).get(interaction.user.id) || { coins: 0 };

    if (userData.coins < finalPrice) {
      const missing = finalPrice - userData.coins;
      return interaction.editReply(
        `❌ Nicht genug Coins! Du benötigst ${missing} Coins mehr.` + 
        (usedCoupon ? `\n(Coupon-Rabatt bereits eingerechnet)` : '')
      );
    }

    // 4. Transaktion für kritische Operationen
    const transaction = db.transaction(() => {
      // Bezahlung durchführen
      db.prepare(`
        UPDATE users 
        SET coins = coins - ? 
        WHERE user_id = ?
      `).run(finalPrice, interaction.user.id);

      if (product.delivery_type === 'KEY') {
        const key = db.prepare(`
          SELECT key FROM product_keys 
          WHERE product_id = ? AND used = 0 
          LIMIT 1
        `).get(product.id);

        if (!key) throw new Error('KEYS_EXHAUSTED');

        db.prepare(`
          UPDATE product_keys 
          SET used = 1, user_id = ? 
          WHERE key = ?
        `).run(interaction.user.id, key.key);
      }
      
      // Dateikauf registrieren
      if (product.delivery_type === 'FILE') {
        db.prepare(`
          INSERT OR IGNORE INTO file_purchases (user_id, product_id)
          VALUES (?, ?)
        `).run(interaction.user.id, product.id);
      }
    });

    transaction();

    // 5. Lieferungsnachricht erstellen
    const deliveryEmbed = new EmbedBuilder()
      .setTitle(`🎁 ${product.name} - Kaufbestätigung`)
      .setDescription([
        product.description,
        usedCoupon && `🎉 **${usedCoupon.discount_percent}% Rabatt angewendet!**`,
        `💳 **Bezahlter Betrag:** ${finalPrice} Coins`
      ].filter(Boolean).join('\n\n'))
      .addFields(
        { 
          name: 'Bestellnummer', 
          value: `#${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          inline: true 
        },
        { 
          name: 'Lieferart', 
          value: product.delivery_type === 'KEY' ? '🔑 Digitaler Key' : '📁 Direktdownload',
          inline: true 
        }
      )
      .setColor(config.EMBEDS.DEFAULT_COLOR)
      .setThumbnail(product.image_url)
      .setFooter({ text: 'Die Lieferung erfolgt ausschließlich per DM' });

    // 6. Lieferbutton konfigurieren
    const components = new ActionRowBuilder().addComponents(
      product.delivery_type === 'FILE' 
        ? new ButtonBuilder()
            .setLabel('Jetzt downloaden')
            .setURL(product.delivery_content)
            .setStyle(ButtonStyle.Link)
        : new ButtonBuilder()
            .setCustomId(`revealKey_${product.id}`)
            .setLabel('Key anzeigen')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔑')
    );

    // 7. DM senden mit Bestelldetails
    await interaction.user.send({
      embeds: [deliveryEmbed],
      components: [components]
    });

    // 8. Bestätigung an User
    await interaction.editReply({
      content: '✅ Kauf erfolgreich! Die Lieferdetails wurden dir per DM gesendet.',
    });

  } catch (error) {
    console.error('Kauffehler:', error);
    
    const errorMessage = {
      'KEYS_EXHAUSTED': '❌ Vorübergehend ausverkauft! Bitte später erneut versuchen.',
    }[error.message] || '❌ Ein kritischer Fehler ist aufgetreten!';

    await interaction.editReply(errorMessage);
  }
});

// 🔑 KEY REVEAL HANDLER (FIXED)
client.on('interactionCreate', async interaction => {
  // First check if it's a button interaction
  if (!interaction.isButton() || !interaction.customId.startsWith('revealKey_')) return;
  
  const productId = interaction.customId.split('_')[1];
  
  const key = db.prepare(`
    SELECT key FROM product_keys 
    WHERE user_id = ? AND product_id = ? AND used = 1 
    ORDER BY ROWID DESC 
    LIMIT 1
  `).get(interaction.user.id, productId);

  if (key) {
    await interaction.reply({
      content: `🔑 Dein Key: ||${key.key}||`,
      ephemeral: true
    });
  } else {
    await interaction.reply({
      content: '❌ Kein Key gefunden!',
      ephemeral: true
    });
  }
});

// 🔧 ADMIN: PRODUCT CREATION
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'createproduct') {
    // Berechtigungen prüfen
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '🔒 Admin-Berechtigung benötigt!', ephemeral: true });
    }

    // Optionen auslesen
    const name = interaction.options.getString('name');
    const price = interaction.options.getInteger('price');
    const description = interaction.options.getString('description');
    const image = interaction.options.getString('image');
    const deliveryType = interaction.options.getString('delivery_type');
    const deliveryContent = interaction.options.getString('delivery_content');

    try {
      // Produkt in Datenbank speichern
      const result = db.prepare(`
        INSERT INTO products 
        (name, price, description, image_url, delivery_type, delivery_content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, price, description, image, deliveryType, deliveryContent);

      // Bei Key-Lieferung Keys generieren
      if (deliveryType === 'KEY') {
        const keysToGenerate = 10;
        const stmt = db.prepare(`
          INSERT INTO product_keys (key, product_id) 
          VALUES (?, ?)
        `);

        for (let i = 0; i < keysToGenerate; i++) {
          const key = generateProductKey(deliveryContent);
          stmt.run(key, result.lastInsertRowid);
        }
      }

      // Bestätigung senden
      const embed = new EmbedBuilder()
        .setTitle('🎉 Neues Produkt erstellt')
        .addFields(
          { name: 'Name', value: name, inline: true },
          { name: 'Preis', value: `${price} Coins`, inline: true },
          { name: 'Liefertyp', value: deliveryType, inline: true },
          { name: 'ID', value: `#${result.lastInsertRowid}`, inline: true }
        )
        .setThumbnail(image)
        .setColor(config.EMBEDS.DEFAULT_COLOR)

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      console.error('Fehler beim Erstellen:', error);
      await interaction.reply({ 
        content: '❌ Fehler beim Erstellen des Produkts!', 
        ephemeral: true 
      });
    }
  }
});


// --------------------------------------------------
// 💰 COUPON SYSTEM
// --------------------------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'createcoupon') {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '🔒 Keine Berechtigung!', ephemeral: true });
    }

    const discount = interaction.options.getInteger('discount');
    const products = interaction.options.getString('products') || 'all';
    const duration = interaction.options.getInteger('duration');
    const maxUses = interaction.options.getInteger('uses');

    const couponCode = generateCouponCode();
    const expiresAt = new Date(Date.now() + duration * 3600000);

    db.prepare(`
      INSERT INTO coupons (code, discount_percent, product_ids, expires_at, max_uses)
      VALUES (?, ?, ?, ?, ?)
    `).run(couponCode, discount, products, expiresAt.toISOString(), maxUses);

    const embed = new EmbedBuilder()
      .setTitle('🎟️ Neuer Coupon')
      .addFields(
        { name: 'Code', value: `\`${couponCode}\`` },
        { name: 'Rabatt', value: `${discount}%`, inline: true },
        { name: 'Gültig für', value: products === 'all' ? 'Alle Produkte' : products, inline: true },
        { name: 'Läuft ab', value: `<t:${Math.floor(expiresAt.getTime()/1000)}:R>`, inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// --------------------------------------------------
// ⭐ RATING SYSTEM
// --------------------------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'rateproduct') {
    const productId = interaction.options.getInteger('product_id');
    const rating = interaction.options.getInteger('rating');
    const review = interaction.options.getString('review');

    const hasPurchased = db.prepare(`
      SELECT 1 FROM (
        SELECT product_id, user_id FROM product_keys WHERE used = 1
        UNION
        SELECT product_id, user_id FROM file_purchases
      ) WHERE product_id = ? AND user_id = ?
    `).get(productId, interaction.user.id);

    if (!hasPurchased) {
      return interaction.reply({ 
        content: '❌ Nur für Käufer!', 
        ephemeral: true 
      });
    }

    db.prepare(`
      INSERT INTO product_ratings (user_id, product_id, rating, review)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, product_id) 
      DO UPDATE SET rating = excluded.rating, review = excluded.review
    `).run(interaction.user.id, productId, rating, review);

    await interaction.reply({ 
      content: '✅ Bewertung gespeichert!', 
      ephemeral: true 
    });
  }
});



// 💰 Balance System
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'balance') {
    const target = interaction.options.getUser('user') || interaction.user;
    const balance = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(target.id)?.coins || 0;

    const embed = new EmbedBuilder()
      .setTitle(`💰 Kontostand von ${target.username}`)
      .setDescription(`${balance} Coins`)
      .setColor(config.EMBEDS.DEFAULT_COLOR)
      .setThumbnail(target.displayAvatarURL());

    await interaction.reply({ embeds: [embed] });
  }
});

// 🎉 Giveaway System
const activeGiveaways = new Map();

client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'giveaway') {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '🔒 Admin-Berechtigung benötigt!', ephemeral: true });
    }

    const duration = interaction.options.getInteger('duration');
    const coins = interaction.options.getInteger('coins');
    const winners = interaction.options.getInteger('winners');
    const giveawayId = crypto.randomBytes(8).toString('hex');

    const endTime = Date.now() + duration * 60000;

    const embed = new EmbedBuilder()
      .setTitle('🎉 NEUES GIVEAWAY 🎉')
      .setDescription(
        `**Preis:** ${coins} Coins\n` +
        `**Gewinner:** ${winners}\n` +
        `**Endet:** <t:${Math.floor(endTime/1000)}:R>`
      )
      .setColor(config.EMBEDS.DEFAULT_COLOR)

    const button = new ButtonBuilder()
      .setCustomId(`giveaway_${giveawayId}`)
      .setLabel('Mitmachen')
      .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);
      const channel = client.channels.cache.get(config.CHANNELS.GIVEAWAY_CHANNEL);
      
      // Korrekter send()-Aufruf
      const message = await channel.send({ 
        embeds: [embed], 
        components: [row]
      });

    activeGiveaways.set(giveawayId, {
      endTime,
      coins,
      winners,
      participants: [],
      messageId: message.id
    });

    // Giveaway Timer
    setTimeout(async () => {
      const giveaway = activeGiveaways.get(giveawayId);
      if (!giveaway) return;

      const winners = giveaway.participants
        .sort(() => Math.random() - 0.5)
        .slice(0, giveaway.winners);

      // Coins verteilen
      winners.forEach(userId => {
        db.prepare(`
          INSERT INTO users (user_id, coins)
          VALUES (?, COALESCE((SELECT coins FROM users WHERE user_id = ?), 0) + ?)
          ON CONFLICT(user_id) DO UPDATE SET coins = excluded.coins
        `).run(userId, userId, giveaway.coins);
      });

      const resultEmbed = new EmbedBuilder()
        .setTitle('🎉 GIVEAWAY BEENDET 🎉')
        .setDescription(winners.length > 0 
          ? `Gewinner: ${winners.map(w => `<@${w}>`).join(' ')}\nJeder erhält ${giveaway.coins} Coins!` 
          : 'Keine Teilnehmer 😢')
        .setColor(winners.length > 0 ? 0x00FF00 : 0xFF0000);

      await interaction.followUp({ embeds: [resultEmbed] });
      activeGiveaways.delete(giveawayId);
    }, duration * 60000);
  }
});

// Giveaway Button Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('giveaway_')) return;

  const giveawayId = interaction.customId.split('_')[1];
  const giveaway = activeGiveaways.get(giveawayId);

  if (!giveaway || Date.now() > giveaway.endTime) {
    return interaction.reply({ 
      content: 'Giveaway bereits beendet!', 
      ephemeral: true 
    });
  }

  if (giveaway.participants.includes(interaction.user.id)) {
    return interaction.reply({ 
      content: 'Du bist bereits dabei!', 
      ephemeral: true 
    });
  }

  giveaway.participants.push(interaction.user.id);
  await interaction.reply({ 
    content: '✅ Erfolgreich teilgenommen!', 
    ephemeral: true 
  });
});


// --------------------------------------------------
// ❤️ WISHLIST SYSTEM
// --------------------------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'wishlist') {
    const subcommand = interaction.options.getSubcommand();

    switch(subcommand) {
      case 'show':
        const wishlist = db.prepare(`
          SELECT p.id, p.name FROM wishlist w
          JOIN products p ON w.product_id = p.id
          WHERE w.user_id = ?
        `).all(interaction.user.id);

        const embed = new EmbedBuilder()
          .setTitle('🎁 Deine Wunschliste')
          .setDescription(wishlist.map(p => `#${p.id} - ${p.name}`).join('\n') || 'Leer')
          .setColor(config.EMBEDS.DEFAULT_COLOR)

        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;

      case 'add':
        const productId = interaction.options.getInteger('product_id');
        db.prepare(`
          INSERT OR IGNORE INTO wishlist (user_id, product_id)
          VALUES (?, ?)
        `).run(interaction.user.id, productId);
        await interaction.reply({ 
          content: '✅ Produkt hinzugefügt!', 
          ephemeral: true 
        });
        break;

      case 'remove':
        const removeId = interaction.options.getInteger('product_id');
        db.prepare(`
          DELETE FROM wishlist 
          WHERE user_id = ? AND product_id = ?
        `).run(interaction.user.id, removeId);
        await interaction.reply({ 
          content: '✅ Produkt entfernt!', 
          ephemeral: true 
        });
        break;
    }
  }
});

// 🔑 START BOT
client.login(config.BOT_TOKEN);