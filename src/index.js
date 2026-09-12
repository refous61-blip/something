import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import { GitHubWhitelistStore, KINDS } from "./store.js";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "OPERATOR_IDS", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const operators = new Set(process.env.OPERATOR_IDS.split(",").map((id) => id.trim()).filter(Boolean));
const choices = Object.keys(KINDS).map((name) => ({ name, value: name }));
const targetOptions = (builder) => builder
  .addStringOption((o) => o.setName("roblox_id").setDescription("Numeric Roblox user ID").setRequired(true))
  .addStringOption((o) => o.setName("kind").setDescription("Whitelist category").setRequired(true).addChoices(...choices))
  .addStringOption((o) => o.setName("item").setDescription("Exact item name, including capitalization").setRequired(true));

const commands = [
  targetOptions(new SlashCommandBuilder().setName("whitelist").setDescription("Add a Roblox user to a whitelist"))
    .addIntegerOption((o) => o.setName("days").setDescription("Optional expiry in days").setMinValue(1).setMaxValue(3650)),
  targetOptions(new SlashCommandBuilder().setName("unwhitelist").setDescription("Remove a Roblox user from a whitelist")),
  targetOptions(new SlashCommandBuilder().setName("wlcheck").setDescription("Check a Roblox user's whitelist entry"))
].map((command) => command.toJSON());

const store = new GitHubWhitelistStore({
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_BRANCH || "main"
});

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
await rest.put(route, { body: commands });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once("ready", () => console.log(`Ready as ${client.user.tag}; ${operators.size} operator(s) configured.`));

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply({ ephemeral: true });

  if (!operators.has(interaction.user.id)) {
    await interaction.editReply("You are not an operator for this bot.");
    return;
  }

  const robloxId = interaction.options.getString("roblox_id", true).trim();
  const kind = interaction.options.getString("kind", true);
  const item = interaction.options.getString("item", true).trim();
  if (!/^\d{1,12}$/.test(robloxId) || Number(robloxId) > Number.MAX_SAFE_INTEGER) {
    await interaction.editReply("That Roblox ID is invalid. Use the numeric user ID, not a username.");
    return;
  }
  if (!item || item.length > 100 || item.includes(":")) {
    await interaction.editReply("The item must be 1–100 characters and cannot contain `:`.");
    return;
  }

  try {
    if (interaction.commandName === "wlcheck") {
      const active = await store.check({ robloxId, kind, item });
      await interaction.editReply(active ? `✅ ${robloxId} is whitelisted for **${kind}/${item}**.` : `❌ ${robloxId} is not whitelisted for **${kind}/${item}**.`);
      return;
    }

    const action = interaction.commandName === "whitelist" ? "add" : "remove";
    const days = interaction.options.getInteger("days");
    const expiresAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    const result = await store.mutate(action, {
      robloxId,
      kind,
      item,
      expiresAt,
      actor: { discordId: interaction.user.id, username: interaction.user.username }
    });
    if (!result.changed) {
      await interaction.editReply(`No change: ${robloxId} is ${result.reason} for **${kind}/${item}**.`);
      return;
    }
    await interaction.editReply(`${action === "add" ? "✅ Whitelisted" : "🗑️ Removed"} **${robloxId}** ${action === "add" ? "for" : "from"} **${kind}/${item}**${expiresAt ? ` until ${expiresAt.slice(0, 10)}` : ""}.`);
  } catch (error) {
    console.error(error);
    await interaction.editReply("The update failed. Check the bot logs and verify the GitHub token has Contents read/write access.");
  }
});

await client.login(process.env.DISCORD_TOKEN);
