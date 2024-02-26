import {Command, Config, Interfaces} from '@oclif/core'
import YAML from 'yaml'
import * as ejs from 'ejs'

type CommandCompletion = {
  flags: CommandFlags
  id: string
  summary: string
}

type CommandFlags = {
  [name: string]: Command.Flag.Cached
}

type Topic = {
  description: string
  name: string
}

type SpecCommand = {
  name: string
  description?: string
  aliases?: string[]
  hidden?: boolean
  flags?: Map<string, string>
  persistentFlags?: Map<string, string>
  commands?: SpecCommand[]
}

export default class Carapace {
  protected config: Config

  private _coTopics?: string[]

  private commands: CommandCompletion[]

  private topics: Topic[]

  constructor(config: Config) {
    this.config = config
    this.topics = this.getTopics()
    this.commands = this.getCommands()
  }

  public generate(): string {
    let command : SpecCommand = {
      name: this.config.bin,
      // "description": "TODO" // TODO
    }

    let subcommands: SpecCommand[] = [];
    for (const p of this.config.getPluginsList()) {
      for (const c of p.commands) {
        subcommands.push(this.specCommand(c))
      }
    }

    if (subcommands.length > 0) {
      command.commands = subcommands
    }
    return YAML.stringify(command)    
  }

  private specCommand(cmd: Command.Loadable): SpecCommand {
    let c: SpecCommand = {
      name: cmd.id,
      description: cmd.description || "",
      aliases: cmd.aliases || [],
      hidden: cmd.hidden || false,
      flags: this.specFlags(cmd.flags)
    }
    return c
  }

  private specFlags(commandFlags: CommandFlags): Map<string, string> {
    const flagNames = Object.keys(commandFlags)

    // Add comp for the global `--help` flag.
    // if (!flagNames.includes('help')) {
    //   flaghHashtables.push('    "help" = @{ "summary" = "Show help for command" }')
    // }

    let m = new Map<string, string>()
    if (flagNames.length > 0) {
      for (const flagName of flagNames) {
        const f = commandFlags[flagName]
        m.set("--"+f.name, f.description || "") // TODO shorthand, type,...
      }
    }
    return m
  }

  private getCommands(): CommandCompletion[] {
    const cmds: CommandCompletion[] = []

    for (const p of this.config.getPluginsList()) {
      for (const c of p.commands) {
        if (c.hidden) continue
        const summary = this.sanitizeSummary(c.summary ?? c.description)
        const {flags} = c
        cmds.push({
          flags,
          id: c.id,
          summary,
        })

        for (const a of c.aliases) {
          cmds.push({
            flags,
            id: a,
            summary,
          })

          const split = a.split(':')

          let topic = split[0]

          // Completion funcs are generated from topics:
          // `force` -> `force:org` -> `force:org:open|list`
          //
          // but aliases aren't guaranteed to follow the plugin command tree
          // so we need to add any missing topic between the starting point and the alias.
          for (let i = 0; i < split.length - 1; i++) {
            if (!this.topics.some((t) => t.name === topic)) {
              this.topics.push({
                description: `${topic.replaceAll(':', ' ')} commands`,
                name: topic,
              })
            }

            topic += `:${split[i + 1]}`
          }
        }
      }
    }

    return cmds
  }

  private getTopics(): Topic[] {
    const topics = this.config.topics
      .filter((topic: Interfaces.Topic) => {
        // it is assumed a topic has a child if it has children
        const hasChild = this.config.topics.some((subTopic) => subTopic.name.includes(`${topic.name}:`))
        return hasChild
      })
      .sort((a, b) => {
        if (a.name < b.name) {
          return -1
        }

        if (a.name > b.name) {
          return 1
        }

        return 0
      })
      .map((t) => {
        const description = t.description
          ? this.sanitizeSummary(t.description)
          : `${t.name.replaceAll(':', ' ')} commands`

        return {
          description,
          name: t.name,
        }
      })

    return topics
  }

  private sanitizeSummary(summary?: string): string {
    if (summary === undefined) {
      return ''
    }

    return ejs
      .render(summary, {config: this.config})
      .replaceAll(/(["`])/g, '\\\\\\$1') // backticks and double-quotes require triple-backslashes

      .replaceAll(/([[\]])/g, '\\\\$1') // square brackets require double-backslashes
      .split('\n')[0] // only use the first line
  }
}
