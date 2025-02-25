type display = {
    label: string;
    value: string | Record<string, string>;
};

export class Gene {
    private symbol: string;
    private name: string;
    private url: string;
    private display: display[] | undefined;

    setUrl(value: string) {
        this.url = value;
    }

    addDisplay(value: display) {
        if (!this.display) {
            this.display = [];
        }
        this.display.push(value);
    }

    setSymbol(value: string) {
        this.symbol = value;
    }

    setName(value: string) {
        this.name = value;
    }

    toString(): string {
        return `Gene { symbol: ${this.symbol}, name: ${this.name}, url: ${this.url}, display: ${JSON.stringify(this.display)} }`;
    }
}
